"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePlayerStore } from "@/stores/usePlayerStore";
import { useToastStore } from "@/stores/useToastStore";
import { saveLyrics } from "@/lib/firestore-tracks";
import { requestLyricsAlign } from "@/lib/ai-client";
import { buildLrc, splitLyricLines, formatLrcTime, parseLyrics } from "@/lib/lrc";
import { formatTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import Modal from "@/components/ui/Modal";
import type { Track } from "@/types/music";
import {
  Loader2,
  Play,
  Pause,
  SkipBack,
  RotateCcw,
  CornerDownLeft,
  Check,
  Music2,
  Sparkles,
} from "lucide-react";

/* ───────────────────────────────────────────
   LyricsSyncEditor — 탭-싱크 가사 에디터
   2단계:
   ① 붙여넣기: 가사 텍스트 입력 (기존 LRC 가져와 시작도 가능)
   ② 싱크: 곡을 들으며 "지금 줄" 버튼/Space 로 현재 줄에 타임스탬프를
      찍고 다음 줄로 진행. 각 줄 시각은 표에서 미세조정·되돌리기 가능.
   완료 시 LRC 로 트랙 문서(lyrics 필드)에 저장.
   ─────────────────────────────────────────── */

interface EditLine {
  text: string;
  time: number | null;
}

type Phase = "paste" | "sync";

export default function LyricsSyncEditor({
  open,
  track,
  initial,
  onClose,
  onSaved,
}: {
  open: boolean;
  track: Track;
  initial: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const currentTime = usePlayerStore((s) => s.currentTime);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const toggle = usePlayerStore((s) => s.toggle);
  const seek = usePlayerStore((s) => s.seek);
  const playTrack = usePlayerStore((s) => s.playTrack);
  const currentId = usePlayerStore((s) => s.currentId);
  const addToast = useToastStore((s) => s.addToast);

  const [phase, setPhase] = useState<Phase>("paste");
  const [text, setText] = useState("");
  const [lines, setLines] = useState<EditLine[]>([]);
  const [cursor, setCursor] = useState(0); // 다음에 타임스탬프 찍을 줄
  const [busy, setBusy] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);

  const activeRef = useRef<HTMLLIElement>(null);

  /* 모달 열릴 때 초기화 — 기존 가사가 있으면 텍스트로 복원 */
  useEffect(() => {
    if (!open) return;
    setPhase("paste");
    setCursor(0);
    if (initial.trim()) {
      const parsed = parseLyrics(initial);
      setText(parsed.lines.map((l) => l.text).join("\n"));
    } else {
      setText("");
    }
  }, [open, initial]);

  function startSync() {
    const raw = splitLyricLines(text);
    // 끝의 빈 줄만 정리(중간 빈 줄=간주는 보존)
    while (raw.length && raw[raw.length - 1] === "") raw.pop();
    if (!raw.length) {
      addToast({ type: "error", message: "가사를 먼저 입력하세요" });
      return;
    }
    setLines(raw.map((t) => ({ text: t, time: null })));
    setCursor(0);
    setPhase("sync");
    // 이 곡이 현재 재생 곡이 아니면 재생 시작 (처음부터)
    if (currentId !== track.id) {
      playTrack(track.id);
      seek(0);
    }
  }

  /** AI 자동 싱크 — OpenAI Whisper 로 초안 생성 후 검토 단계로 진입 */
  async function aiAlign() {
    if (aiBusy || !text.trim()) return;
    setAiBusy(true);
    try {
      const lines = await requestLyricsAlign({
        lyrics: text,
        // 스트리밍 mp3 (작음·Whisper 25MB 한도 안전) 우선, 없으면 원본
        audioUrl: track.streamUrl || track.originalUrl,
        duration: track.duration,
      });
      setLines(lines);
      setCursor(lines.length); // 전부 채워진 상태로 검토
      setPhase("sync");
      if (currentId !== track.id) playTrack(track.id);
      addToast({
        type: "success",
        message: "AI 초안 완성 — 들어보며 줄별 ± 로 미세조정하세요",
        duration: 5000,
      });
    } catch (e) {
      addToast({
        type: "error",
        message: e instanceof Error ? e.message : "AI 싱크에 실패했습니다",
        duration: 6000,
      });
    } finally {
      setAiBusy(false);
    }
  }

  /** 현재 재생 위치를 cursor 줄에 찍고 다음 줄로 */
  function stampNow() {
    if (cursor >= lines.length) return;
    const t = currentTime;
    setLines((prev) =>
      prev.map((l, i) => (i === cursor ? { ...l, time: t } : l))
    );
    setCursor((c) => Math.min(c + 1, lines.length));
  }

  function undoLast() {
    const last = cursor - 1;
    if (last < 0) return;
    setLines((prev) =>
      prev.map((l, i) => (i === last ? { ...l, time: null } : l))
    );
    setCursor(last);
  }

  function resetAll() {
    setLines((prev) => prev.map((l) => ({ ...l, time: null })));
    setCursor(0);
  }

  function adjust(i: number, delta: number) {
    setLines((prev) =>
      prev.map((l, idx) =>
        idx === i && l.time != null
          ? { ...l, time: Math.max(0, l.time + delta) }
          : l
      )
    );
  }

  /* 싱크 단계 키보드: Space=현재 줄 찍기, Backspace=되돌리기 */
  useEffect(() => {
    if (!open || phase !== "sync") return;
    function onKey(e: KeyboardEvent) {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA")) return;
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        stampNow();
      } else if (e.key === "Backspace") {
        e.preventDefault();
        undoLast();
      } else if (e.key.toLowerCase() === "p") {
        e.preventDefault();
        toggle();
      }
    }
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, phase, cursor, lines, currentTime]);

  /* 진행 줄 자동 스크롤 */
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [cursor]);

  const stampedCount = useMemo(
    () => lines.filter((l) => l.time != null).length,
    [lines]
  );
  const allStamped = lines.length > 0 && stampedCount === lines.length;

  async function save() {
    if (busy) return;
    const hasAnyStamp = lines.some((l) => l.time != null);
    const content = hasAnyStamp
      ? buildLrc(lines)
      : lines.map((l) => l.text).join("\n");
    if (!content.trim()) return;
    setBusy(true);
    try {
      const format = await saveLyrics(track.id, content);
      addToast({
        type: "success",
        message:
          format === "lrc"
            ? `싱크 가사 저장 완료 (${stampedCount}줄 타이밍)`
            : "가사를 저장했습니다",
      });
      onSaved();
    } catch (e) {
      addToast({
        type: "error",
        message: e instanceof Error ? e.message : "저장에 실패했습니다",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={() => !busy && onClose()}
      title={
        phase === "paste"
          ? `가사 싱크 — ${track.title}`
          : `타이밍 찍기 — ${stampedCount}/${lines.length}`
      }
      footer={
        phase === "paste" ? (
          <div className="flex flex-wrap items-center justify-end gap-2">
            <button
              onClick={onClose}
              disabled={busy || aiBusy}
              className="mr-auto rounded-xl border border-strong bg-surface-primary px-4 py-2.5 text-sm font-medium text-body transition-colors hover:bg-surface-secondary disabled:opacity-50"
            >
              취소
            </button>
            <button
              onClick={aiAlign}
              disabled={!text.trim() || aiBusy}
              className="flex items-center gap-2 rounded-xl border border-bora-200 bg-bora-50 px-4 py-2.5 text-sm font-semibold text-bora-700 transition-colors hover:bg-bora-100 disabled:opacity-50"
            >
              {aiBusy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              {aiBusy ? "AI 맞추는 중…" : "AI로 자동 싱크"}
            </button>
            <button
              onClick={startSync}
              disabled={!text.trim() || aiBusy}
              className="flex items-center gap-2 rounded-xl bg-bora-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-bora-700 disabled:opacity-50"
            >
              <Play className="h-4 w-4" fill="currentColor" />
              직접 찍기
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-2">
            <button
              onClick={() => setPhase("paste")}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2.5 text-sm font-medium text-body transition-colors hover:bg-surface-secondary disabled:opacity-50"
            >
              <SkipBack className="h-4 w-4" /> 가사 수정
            </button>
            <div className="flex gap-2">
              <button
                onClick={save}
                disabled={busy}
                className="flex items-center gap-2 rounded-xl bg-bora-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-bora-700 disabled:opacity-50"
              >
                {busy ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Check className="h-4 w-4" />
                )}
                {allStamped ? "저장" : `저장 (${stampedCount}줄)`}
              </button>
            </div>
          </div>
        )
      }
    >
      {phase === "paste" ? (
        <div className="space-y-3">
          <p className="text-sm text-body">
            가사를 한 줄에 한 소절씩 붙여넣으세요. 빈 줄은 간주(♪)로 표시됩니다.
            <strong className="font-semibold text-bora-700"> AI로 자동 싱크</strong>는
            초안을 자동 생성하고, <strong className="font-semibold text-heading">직접 찍기</strong>는
            곡을 들으며 줄마다 타이밍을 찍습니다.
          </p>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={12}
            autoFocus
            placeholder={"파도가 밀려오는 새벽\n조용히 눈을 떠\n\n(간주는 빈 줄로)"}
            aria-label="가사 내용"
            className="w-full resize-y rounded-xl border border-strong bg-surface-primary px-4 py-3 text-sm leading-relaxed text-heading outline-none transition-colors placeholder:text-caption focus:border-bora-500 focus:ring-1 focus:ring-bora-500"
          />
          <p className="text-xs text-caption">
            AI 자동 싱크는 OpenAI Whisper 를 사용합니다 (.env.local 에 API 키 필요).
            AI 보컬·한국어는 한두 줄 어긋날 수 있어 다음 화면에서 ± 로 다듬으면 됩니다.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* 재생 컨트롤 + 큰 "지금 줄" 버튼 */}
          <div className="sticky top-0 z-10 -mx-6 -mt-4 border-b border-base bg-surface-primary/95 px-6 pb-4 pt-4 backdrop-blur">
            <div className="mb-3 flex items-center justify-center gap-3">
              <button
                onClick={() => seek(Math.max(0, currentTime - 3))}
                aria-label="3초 뒤로"
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-strong text-body transition-colors hover:bg-surface-secondary"
              >
                <RotateCcw className="h-4 w-4" />
              </button>
              <button
                onClick={toggle}
                aria-label={isPlaying ? "일시정지" : "재생"}
                className="flex h-11 w-11 items-center justify-center rounded-full bg-bora-600 text-white shadow-bora-glow transition-colors hover:bg-bora-700"
              >
                {isPlaying ? (
                  <Pause className="h-5 w-5" fill="currentColor" />
                ) : (
                  <Play className="h-5 w-5 translate-x-px" fill="currentColor" />
                )}
              </button>
              <span className="w-14 text-center text-sm font-bold tabular-nums text-heading">
                {formatTime(currentTime)}
              </span>
            </div>
            <button
              onClick={stampNow}
              disabled={cursor >= lines.length}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-bora-600 py-3 text-sm font-bold text-white shadow-sm transition-all hover:bg-bora-700 active:scale-[0.99] disabled:opacity-40"
            >
              <CornerDownLeft className="h-4 w-4" />
              {cursor >= lines.length ? "모든 줄 완료" : "지금 이 줄 (Space)"}
            </button>
            <div className="mt-2 flex items-center justify-center gap-4 text-[11px] text-caption">
              <button
                onClick={undoLast}
                disabled={cursor === 0}
                className="hover:text-body disabled:opacity-40"
              >
                ← 되돌리기 (Backspace)
              </button>
              <button onClick={resetAll} className="hover:text-body">
                전체 초기화
              </button>
            </div>
          </div>

          {/* 줄 목록 — 진행 줄 강조, 찍힌 줄 시각·미세조정 */}
          <ul className="space-y-1">
            {lines.map((line, i) => {
              const isCursor = i === cursor;
              const stamped = line.time != null;
              return (
                <li
                  key={i}
                  ref={isCursor ? activeRef : undefined}
                  className={cn(
                    "flex items-center gap-2 rounded-xl px-3 py-2 transition-colors",
                    isCursor
                      ? "bg-bora-50 ring-1 ring-bora-200"
                      : stamped
                        ? "bg-surface-secondary/50"
                        : ""
                  )}
                >
                  <span className="w-5 shrink-0 text-center text-[11px] tabular-nums text-caption">
                    {i + 1}
                  </span>
                  <span
                    className={cn(
                      "min-w-0 flex-1 truncate text-sm",
                      isCursor
                        ? "font-bold text-bora-700"
                        : stamped
                          ? "text-heading"
                          : "text-caption"
                    )}
                  >
                    {line.text || <span className="text-caption">♪ (간주)</span>}
                  </span>
                  {stamped ? (
                    <span className="flex shrink-0 items-center gap-1">
                      <button
                        onClick={() => adjust(i, -0.2)}
                        aria-label="0.2초 당기기"
                        className="flex h-6 w-6 items-center justify-center rounded text-caption hover:bg-surface-tertiary hover:text-body"
                      >
                        −
                      </button>
                      <button
                        onClick={() => line.time != null && seek(line.time)}
                        className="w-14 rounded bg-surface-primary px-1 py-0.5 text-center text-[11px] font-medium tabular-nums text-bora-700 ring-1 ring-strong hover:bg-bora-50"
                        title="이 시각으로 이동"
                      >
                        {formatLrcTime(line.time!).slice(1, -1)}
                      </button>
                      <button
                        onClick={() => adjust(i, 0.2)}
                        aria-label="0.2초 밀기"
                        className="flex h-6 w-6 items-center justify-center rounded text-caption hover:bg-surface-tertiary hover:text-body"
                      >
                        +
                      </button>
                    </span>
                  ) : (
                    <Music2 className="h-3.5 w-3.5 shrink-0 text-surface-3" />
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </Modal>
  );
}
