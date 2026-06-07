"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { fetchTrack } from "@/lib/firestore-tracks";
import { isFirebaseConfigured } from "@/lib/firebase";
import { trackShareUrl, copyToClipboard } from "@/lib/track-url";
import { canDownload, downloadTrackFile, downloadTrackCover } from "@/lib/download";
import { useAuth } from "@/contexts/AuthContext";
import { parseLyrics, activeLineIndex, type ParsedLyrics } from "@/lib/lrc";
import { formatTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import TrackArtwork from "@/components/music/TrackArtwork";
import { BRAND_NAME, BRAND_NAME_KO } from "@/lib/constants";
import type { Track } from "@/types/music";
import {
  AudioWaveform,
  Play,
  Pause,
  Loader2,
  Link2,
  Check,
  Lock,
  MicVocal,
  ArrowRight,
  Download,
  ImageDown,
} from "lucide-react";

/* ───────────────────────────────────────────
   /track/[id] — 공개 곡 공유 페이지 (로그인 불필요)
   인증 게이트 밖에서 단독 렌더. 자체 <audio> 미니 플레이어
   (전역 엔진 미사용) + LRC 싱크 가사 + 링크 복사.
   공개곡은 비로그인도 열람, 비공개·없는 곡은 안내.
   ─────────────────────────────────────────── */

type Status = "loading" | "ready" | "missing" | "unconfigured";

export default function TrackShareClient() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const [status, setStatus] = useState<Status>("loading");
  const [track, setTrack] = useState<Track | null>(null);

  useEffect(() => {
    if (!isFirebaseConfigured()) {
      setStatus("unconfigured");
      return;
    }
    if (!id) {
      setStatus("missing");
      return;
    }
    let alive = true;
    fetchTrack(id).then((t) => {
      if (!alive) return;
      if (t) {
        setTrack(t);
        setStatus("ready");
      } else {
        setStatus("missing");
      }
    });
    return () => {
      alive = false;
    };
  }, [id]);

  useEffect(() => {
    if (track) document.title = `${track.title} · ${BRAND_NAME}`;
  }, [track]);

  return (
    <div className="np-hero min-h-dvh">
      <div className="dash-hero__shapes" aria-hidden="true">
        <span className="dash-hero__shape dash-hero__shape--a" />
        <span className="dash-hero__shape dash-hero__shape--b" />
        <span className="dash-hero__shape dash-hero__shape--c" />
      </div>

      <div className="relative z-[1] mx-auto flex min-h-dvh max-w-lg flex-col px-5 py-6 sm:py-10">
        {/* 브랜드 헤더 */}
        <Link
          href="/"
          className="mb-6 inline-flex items-center gap-2 self-start text-white/85 transition-colors hover:text-white"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/25 backdrop-blur-sm">
            <AudioWaveform className="h-4 w-4" />
          </span>
          <span className="text-sm font-bold">{BRAND_NAME}</span>
        </Link>

        {status === "loading" && (
          <div className="flex flex-1 items-center justify-center">
            <Loader2 className="h-7 w-7 animate-spin text-white/70" />
          </div>
        )}

        {status === "unconfigured" && (
          <CenterCard
            title="설정이 필요합니다"
            desc="이 사이트의 Firebase 설정이 완료되지 않았어요."
          />
        )}

        {status === "missing" && (
          <CenterCard
            icon={<Lock className="h-7 w-7 text-white/70" />}
            title="들을 수 없는 곡이에요"
            desc="비공개이거나 삭제된 곡일 수 있어요. 링크가 정확한지 확인해 주세요."
            cta
          />
        )}

        {status === "ready" && track && <SharePlayer track={track} />}
      </div>
    </div>
  );
}

/* ── 자체 오디오 미니 플레이어 ── */
function SharePlayer({ track }: { track: Track }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(track.duration || 0);
  const [copied, setCopied] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const { user } = useAuth();
  const allowDownload = canDownload(user?.email) && track.visibility === "public";

  const parsed: ParsedLyrics | null = useMemo(
    () => (track.lyrics ? parseLyrics(track.lyrics) : null),
    [track.lyrics]
  );
  const activeIdx = useMemo(
    () => (parsed?.synced ? activeLineIndex(parsed.lines, currentTime) : -1),
    [parsed, currentTime]
  );

  const containerRef = useRef<HTMLDivElement>(null);
  const lineRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const userScrollUntil = useRef(0);

  /* 오디오 요소 1회 생성 (전역 엔진과 분리 — 공유 페이지 전용) */
  useEffect(() => {
    const a = new Audio(track.src);
    a.preload = "metadata";
    audioRef.current = a;
    const onTime = () => setCurrentTime(a.currentTime);
    const onDur = () => {
      if (Number.isFinite(a.duration) && a.duration > 0) setDuration(a.duration);
    };
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onEnded = () => setPlaying(false);
    a.addEventListener("timeupdate", onTime);
    a.addEventListener("loadedmetadata", onDur);
    a.addEventListener("durationchange", onDur);
    a.addEventListener("play", onPlay);
    a.addEventListener("pause", onPause);
    a.addEventListener("ended", onEnded);
    return () => {
      a.pause();
      a.removeEventListener("timeupdate", onTime);
      a.removeEventListener("loadedmetadata", onDur);
      a.removeEventListener("durationchange", onDur);
      a.removeEventListener("play", onPlay);
      a.removeEventListener("pause", onPause);
      a.removeEventListener("ended", onEnded);
      a.src = "";
      audioRef.current = null;
    };
  }, [track.src]);

  const toggle = useCallback(() => {
    const a = audioRef.current;
    if (!a) return;
    if (a.paused) void a.play().catch(() => {});
    else a.pause();
  }, []);

  const seek = useCallback((t: number) => {
    const a = audioRef.current;
    if (!a) return;
    try {
      a.currentTime = t;
      setCurrentTime(t);
    } catch {
      /* 메타데이터 로드 전 — 무시 */
    }
  }, []);

  /* 활성 가사 자동 스크롤 */
  useEffect(() => {
    if (activeIdx < 0 || Date.now() < userScrollUntil.current) return;
    const c = containerRef.current;
    const line = lineRefs.current[activeIdx];
    if (!c || !line) return;
    c.scrollTo({
      top: line.offsetTop - c.clientHeight / 2 + line.clientHeight / 2,
      behavior: "smooth",
    });
  }, [activeIdx]);

  async function share() {
    const url = trackShareUrl(track.id);
    // 네이티브 공유 시트 우선(모바일), 없으면 클립보드 복사
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title: `${track.title} — ${BRAND_NAME}`, url });
        return;
      } catch {
        /* 취소/미지원 → 복사 폴백 */
      }
    }
    if (await copyToClipboard(url)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  async function download() {
    if (downloading) return;
    setDownloading(true);
    try {
      await downloadTrackFile(track);
    } finally {
      setDownloading(false);
    }
  }

  async function downloadCover() {
    if (downloading) return;
    setDownloading(true);
    try {
      await downloadTrackCover(track);
    } finally {
      setDownloading(false);
    }
  }

  const pct = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="flex flex-1 flex-col">
      {/* 커버 */}
      <div className="mx-auto mb-6 aspect-square w-full max-w-[280px] overflow-hidden rounded-3xl shadow-2xl ring-1 ring-white/15">
        <TrackArtwork trackId={track.id} src={track.coverUrl} />
      </div>

      {/* 제목 · 아티스트 */}
      <div className="text-center text-white">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{track.title}</h1>
        <p className="mt-1.5 text-sm text-white/75">
          {track.ownerName || track.artist}
          {track.album && ` — ${track.album}`}
        </p>
      </div>

      {/* 시킹 바 */}
      <div className="mt-6 flex items-center gap-3">
        <span className="w-10 shrink-0 text-right text-xs tabular-nums text-white/70">
          {formatTime(currentTime)}
        </span>
        <input
          type="range"
          min={0}
          max={duration || 0}
          step={0.1}
          value={Math.min(currentTime, duration || 0)}
          onChange={(e) => seek(Number(e.target.value))}
          aria-label="재생 위치"
          className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-white/25 accent-white"
          style={{
            background: `linear-gradient(to right, #fff ${pct}%, rgba(255,255,255,0.25) ${pct}%)`,
          }}
        />
        <span className="w-10 shrink-0 text-xs tabular-nums text-white/70">
          {formatTime(duration)}
        </span>
      </div>

      {/* 컨트롤 */}
      <div className="mt-5 flex items-center justify-center gap-4">
        <button
          onClick={toggle}
          aria-label={playing ? "일시정지" : "재생"}
          className="flex h-16 w-16 items-center justify-center rounded-full bg-white text-bora-700 shadow-xl shadow-black/20 transition-transform hover:scale-105 active:scale-95"
        >
          {playing ? (
            <Pause className="h-7 w-7" fill="currentColor" />
          ) : (
            <Play className="h-7 w-7 translate-x-0.5" fill="currentColor" />
          )}
        </button>
        <button
          onClick={share}
          aria-label="링크 공유"
          className="flex items-center gap-2 rounded-full bg-white/15 px-4 py-3 text-sm font-semibold text-white ring-1 ring-white/25 backdrop-blur-sm transition-colors hover:bg-white/25"
        >
          {copied ? <Check className="h-4 w-4" /> : <Link2 className="h-4 w-4" />}
          {copied ? "복사됨" : "링크 공유"}
        </button>
        {allowDownload && (
          <button
            onClick={() => void download()}
            disabled={downloading}
            aria-label="음원 다운로드"
            className="flex items-center gap-2 rounded-full bg-white/15 px-4 py-3 text-sm font-semibold text-white ring-1 ring-white/25 backdrop-blur-sm transition-colors hover:bg-white/25 disabled:opacity-50"
          >
            {downloading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            {downloading ? "받는 중…" : "다운로드"}
          </button>
        )}
        {allowDownload && track.coverUrl && (
          <button
            onClick={() => void downloadCover()}
            disabled={downloading}
            aria-label="커버 이미지 다운로드"
            title="커버 이미지 다운로드"
            className="flex h-12 w-12 items-center justify-center rounded-full bg-white/15 text-white ring-1 ring-white/25 backdrop-blur-sm transition-colors hover:bg-white/25 disabled:opacity-50"
          >
            <ImageDown className="h-4.5 w-4.5" />
          </button>
        )}
      </div>

      {/* 가사 */}
      {parsed && (
        <div
          ref={containerRef}
          onWheel={() => (userScrollUntil.current = Date.now() + 3000)}
          onTouchMove={() => (userScrollUntil.current = Date.now() + 3000)}
          className="mt-7 max-h-72 min-h-0 flex-1 overflow-y-auto px-2 [mask-image:linear-gradient(to_bottom,transparent,black_12%,black_88%,transparent)]"
          style={{ scrollbarWidth: "none" }}
        >
          {parsed.synced ? (
            <div className="space-y-1 py-6">
              {parsed.lines.map((line, i) => (
                <button
                  key={`${line.time}-${i}`}
                  ref={(el) => {
                    lineRefs.current[i] = el;
                  }}
                  onClick={() => line.time != null && seek(line.time)}
                  className={cn(
                    "block w-full px-2 py-1 text-center transition-all duration-300",
                    i === activeIdx
                      ? "scale-105 text-base font-bold text-white"
                      : "text-sm font-medium text-white/45 hover:text-white/75"
                  )}
                >
                  {line.text || "♪"}
                </button>
              ))}
            </div>
          ) : (
            <div className="space-y-1.5 py-6 text-center">
              {parsed.lines.map((line, i) => (
                <p key={i} className="text-sm leading-relaxed text-white/85">
                  {line.text}
                </p>
              ))}
            </div>
          )}
        </div>
      )}

      {!parsed && (
        <div className="mt-7 flex items-center justify-center gap-1.5 text-xs text-white/50">
          <MicVocal className="h-3.5 w-3.5" /> 등록된 가사가 없어요
        </div>
      )}

      {/* CTA */}
      <Link
        href="/"
        className="mt-8 inline-flex items-center justify-center gap-1.5 self-center rounded-full bg-white/10 px-4 py-2 text-xs font-medium text-white/80 ring-1 ring-white/20 transition-colors hover:bg-white/20 hover:text-white"
      >
        {BRAND_NAME_KO}에서 내 음악도 올리기
        <ArrowRight className="h-3.5 w-3.5" />
      </Link>
    </div>
  );
}

function CenterCard({
  icon,
  title,
  desc,
  cta,
}: {
  icon?: React.ReactNode;
  title: string;
  desc: string;
  cta?: boolean;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/20">
        {icon ?? <AudioWaveform className="h-7 w-7 text-white/70" />}
      </div>
      <div>
        <p className="text-base font-bold text-white">{title}</p>
        <p className="mt-1 text-sm text-white/70">{desc}</p>
      </div>
      {cta && (
        <Link
          href="/"
          className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-white px-4 py-2.5 text-sm font-bold text-bora-700 shadow-lg shadow-black/15 transition-transform hover:scale-[1.03] active:scale-95"
        >
          {BRAND_NAME} 둘러보기
          <ArrowRight className="h-4 w-4" />
        </Link>
      )}
    </div>
  );
}
