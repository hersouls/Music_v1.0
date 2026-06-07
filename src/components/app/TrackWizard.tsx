"use client";

import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Dialog,
  DialogPanel,
  DialogTitle,
  Transition,
  TransitionChild,
} from "@headlessui/react";
import { AnimatePresence, motion } from "framer-motion";
import { useAuth } from "@/contexts/AuthContext";
import { useAlbums } from "@/contexts/TracksContext";
import { useToastStore } from "@/stores/useToastStore";
import { useDialogStore } from "@/stores/useDialogStore";
import {
  uploadTrack,
  extOf,
  isConvertible,
  type UploadPhase,
  type UploadResult,
} from "@/lib/upload";
import {
  requestLyricsAlign,
  requestCoverArt,
  type AlignedLine,
} from "@/lib/ai-client";
import { finalizeTrack, newTrackId, uploadTrackCover } from "@/lib/firestore-tracks";
import { looksLikeLrc, buildLrc, formatLrcTime } from "@/lib/lrc";
import { DEFAULT_COVER_STYLE } from "@/lib/cover-styles";
import CoverStylePicker from "@/components/app/CoverStylePicker";
import { formatBytes, formatTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import TrackArtwork from "@/components/music/TrackArtwork";
import type { Visibility } from "@/types/music";
import {
  AudioLines,
  Check,
  Disc3,
  FileAudio,
  FolderPlus,
  Globe,
  Loader2,
  Lock,
  MicVocal,
  Music2,
  Palette,
  RefreshCw,
  Sparkles,
  Upload,
  UploadCloud,
  X,
  type LucideIcon,
} from "lucide-react";

/* ───────────────────────────────────────────
   TrackWizard — 곡 등록 위자드 (하이엔드 5단계 플로우)
   ① 곡 업로드(백그라운드 진행 — 다음 단계와 병렬)
   ② 가사 붙여넣기(LRC 자동 감지)
   ③ AI 가사 싱크(타임스탬프 없을 때 Whisper 자동 정렬)
   ④ Cartoonify 커버 생성(OpenAI 이미지 — 재생성 가능)
   ⑤ 앨범 맵핑 + 공개 설정 → 완료
   업로드 중에는 비공개·싱글로 두고, 완료 시점에 한 번에 반영.
   ─────────────────────────────────────────── */

const ALLOWED_EXTS = [".wav", ".mp3", ".m4a", ".aac", ".ogg", ".flac"];
const ACCEPT = `audio/*,${ALLOWED_EXTS.join(",")}`;
const NEW_ALBUM = "__new__";

type StepId = "file" | "lyrics" | "sync" | "art" | "album";

const STEP_META: Record<StepId, { label: string; desc: string; icon: LucideIcon }> = {
  file: { label: "곡 업로드", desc: "오디오 파일을 골라주세요 — 업로드는 뒤에서 진행돼요", icon: UploadCloud },
  lyrics: { label: "가사", desc: "가사를 붙여넣으세요 (없으면 건너뛰어도 돼요)", icon: MicVocal },
  sync: { label: "AI 싱크", desc: "Whisper 가 가사 줄마다 타이밍을 맞춰요", icon: AudioLines },
  art: { label: "커버 아트", desc: "곡에 어울리는 Cartoonify 커버를 그려요", icon: Palette },
  album: { label: "앨범", desc: "앨범에 담고 공개 여부를 정하면 끝!", icon: Disc3 },
};

interface UploadStatus {
  status: "idle" | "working" | "done" | "error";
  phase?: UploadPhase;
  pct: number;
  error?: string;
}

interface SyncStatus {
  status: "idle" | "working" | "done" | "error" | "skipped";
  lines?: AlignedLine[];
  error?: string;
}

interface ArtStatus {
  status: "idle" | "working" | "done" | "error" | "skipped";
  blob?: Blob;
  previewUrl?: string;
  error?: string;
}

const PHASE_LABEL: Record<UploadPhase, string> = {
  probe: "분석 중",
  convert: "mp3 변환 중",
  upload: "업로드 중",
  finalize: "마무리 중",
};

const stepMotion = {
  initial: { opacity: 0, x: 28 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -28 },
  transition: { duration: 0.24, ease: [0.22, 1, 0.36, 1] as const },
};

export default function TrackWizard({
  open,
  onClose,
  onSwitchToBulk,
}: {
  open: boolean;
  onClose: () => void;
  /** "여러 곡 한 번에" — 일괄 등록 모달로 전환 */
  onSwitchToBulk?: () => void;
}) {
  const { uid, user } = useAuth();
  const albums = useAlbums();
  const addToast = useToastStore((s) => s.addToast);
  const openDialog = useDialogStore((s) => s.openDialog);

  const [step, setStep] = useState<StepId>("file");
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [upload, setUpload] = useState<UploadStatus>({ status: "idle", pct: 0 });
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null);
  const [lyricsText, setLyricsText] = useState("");
  const [sync, setSync] = useState<SyncStatus>({ status: "idle" });
  const [art, setArt] = useState<ArtStatus>({ status: "idle" });
  const [artStyle, setArtStyle] = useState<string>(DEFAULT_COVER_STYLE);
  const [albumChoice, setAlbumChoice] = useState("");
  const [newAlbum, setNewAlbum] = useState("");
  const [visibility, setVisibility] = useState<Visibility>("public");
  /** WAV/FLAC 을 무손실 원본 그대로 등록(mp3 변환 생략) */
  const [keepLossless, setKeepLossless] = useState(false);
  const [finishing, setFinishing] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  /** 싱크가 어떤 가사 텍스트 기준으로 계산됐는지 — 바뀌면 무효화 */
  const syncedForRef = useRef("");
  const artUrlRef = useRef<string | null>(null);
  /** 위자드 세션 토큰 — 닫고 다시 열었을 때 이전 세션의 업로드 콜백이
      새 세션 상태를 오염시키지 않게 가드 (업로드는 백그라운드에서 계속됨) */
  const sessionRef = useRef(0);
  /** 재시도 시 동일 문서 id 재사용 — 고아 Storage 객체 방지 */
  const trackIdRef = useRef<string | null>(null);
  /** 커버가 이 trackId 로 이미 Storage 에 올라갔으면 재업로드 생략(멱등) */
  const coverUploadedRef = useRef<{ id: string; coverUrl: string; coverPath: string } | null>(null);

  const isLrcPaste = useMemo(() => looksLikeLrc(lyricsText), [lyricsText]);
  const hasLyrics = lyricsText.trim().length > 0;
  const title = file ? (extOf(file.name) ? file.name.slice(0, -extOf(file.name).length) : file.name).trim() : "";

  /* 보이는 단계 — 붙여넣은 가사에 타임스탬프가 없을 때만 싱크 단계 */
  const steps = useMemo<StepId[]>(() => {
    const s: StepId[] = ["file", "lyrics"];
    if (hasLyrics && !isLrcPaste) s.push("sync");
    s.push("art", "album");
    return s;
  }, [hasLyrics, isLrcPaste]);
  const stepIdx = Math.max(0, steps.indexOf(step));
  const isLast = stepIdx === steps.length - 1;

  /* 열릴 때 초기화 */
  useEffect(() => {
    if (!open) return;
    sessionRef.current += 1;
    setStep("file");
    setFile(null);
    setDragOver(false);
    setUpload({ status: "idle", pct: 0 });
    setUploadResult(null);
    setLyricsText("");
    setSync({ status: "idle" });
    setArt({ status: "idle" });
    setArtStyle(DEFAULT_COVER_STYLE);
    setAlbumChoice("");
    setNewAlbum("");
    setVisibility("public");
    setKeepLossless(false);
    setFinishing(false);
    syncedForRef.current = "";
    trackIdRef.current = null;
    coverUploadedRef.current = null;
    if (artUrlRef.current) {
      URL.revokeObjectURL(artUrlRef.current);
      artUrlRef.current = null;
    }
  }, [open]);

  /* 언마운트 시 미리보기 URL 정리 */
  useEffect(
    () => () => {
      if (artUrlRef.current) URL.revokeObjectURL(artUrlRef.current);
    },
    []
  );

  /* 가사가 바뀌면 기존 싱크 결과 무효화 */
  useEffect(() => {
    if (sync.status === "working" || sync.status === "idle") return;
    if (lyricsText !== syncedForRef.current) setSync({ status: "idle" });
  }, [lyricsText, sync.status]);

  /* ── ① 업로드 (백그라운드) ── */
  const startUpload = useCallback(
    (f: File) => {
      if (!uid) return;
      const session = sessionRef.current;
      const ownerName = user?.displayName || user?.email?.split("@")[0] || "Moonwave";
      // id 를 업로드 전에 고정 — 실패→재시도 시 같은 경로를 덮어써 고아 객체를 만들지 않음
      if (!trackIdRef.current) trackIdRef.current = newTrackId();
      const trackId = trackIdRef.current;
      setUpload({ status: "working", phase: "probe", pct: 0 });
      uploadTrack(
        // 위자드 완료 전까지는 비공개·싱글 — 마지막 단계에서 한 번에 반영.
        { file: f, album: "", visibility: "private", uid, ownerName, trackId, convert: !keepLossless },
        {
          onProgress: (phase, ratio) => {
            if (sessionRef.current !== session) return;
            setUpload((s) =>
              s.status === "working"
                ? { ...s, phase, pct: Math.round(ratio * 100) }
                : s
            );
          },
        }
      )
        .then((res) => {
          trackIdRef.current = res.id; // 재시도가 같은 id 를 쓰도록 고정
          if (sessionRef.current !== session) return;
          setUploadResult(res);
          setUpload({ status: "done", pct: 100 });
        })
        .catch((e) => {
          if (sessionRef.current !== session) return;
          setUpload({
            status: "error",
            pct: 0,
            error: e instanceof Error ? e.message : "업로드에 실패했습니다",
          });
        });
    },
    [uid, user, keepLossless]
  );

  function pickFile(f: File) {
    if (!ALLOWED_EXTS.includes(extOf(f.name))) {
      addToast({ type: "error", message: "지원하지 않는 형식입니다 (WAV·MP3·M4A·AAC·OGG·FLAC)" });
      return;
    }
    setFile(f);
  }

  /* ── ③ AI 싱크 ── */
  const runSync = useCallback(async () => {
    if (!uploadResult || !lyricsText.trim()) return;
    const session = sessionRef.current;
    setSync({ status: "working" });
    try {
      const lines = await requestLyricsAlign({
        lyrics: lyricsText,
        audioUrl: uploadResult.streamUrl || uploadResult.originalUrl,
        duration: uploadResult.duration,
      });
      if (sessionRef.current !== session) return;
      syncedForRef.current = lyricsText;
      setSync({ status: "done", lines });
    } catch (e) {
      if (sessionRef.current !== session) return;
      syncedForRef.current = lyricsText;
      setSync({
        status: "error",
        error: e instanceof Error ? e.message : "AI 싱크에 실패했습니다",
      });
    }
  }, [uploadResult, lyricsText]);

  /* 싱크 단계 진입 + 음원 준비 완료 시 자동 시작 */
  useEffect(() => {
    if (open && step === "sync" && sync.status === "idle" && uploadResult) {
      void runSync();
    }
  }, [open, step, sync.status, uploadResult, runSync]);

  /* ── ④ AI 커버 (스타일 선택) ── */
  const runArt = useCallback(
    async (style: string) => {
      if (!title) return;
      const session = sessionRef.current;
      setArt((prev) => {
        if (prev.previewUrl) URL.revokeObjectURL(prev.previewUrl);
        artUrlRef.current = null;
        return { status: "working" };
      });
      try {
        const blob = await requestCoverArt({
          title,
          lyrics: lyricsText || undefined,
          style,
        });
        if (sessionRef.current !== session) return;
        const previewUrl = URL.createObjectURL(blob);
        artUrlRef.current = previewUrl;
        setArt({ status: "done", blob, previewUrl });
      } catch (e) {
        if (sessionRef.current !== session) return;
        setArt({
          status: "error",
          error: e instanceof Error ? e.message : "커버 생성에 실패했습니다",
        });
      }
    },
    [title, lyricsText]
  );

  /* 스타일 칩 선택 → 그 스타일로 즉시 재생성 (미리보기, 저장 전) */
  function selectArtStyle(style: string) {
    if (art.status === "working") return;
    setArtStyle(style);
    void runArt(style);
  }

  /* 커버 단계 첫 진입 시 현재 스타일로 자동 생성 */
  useEffect(() => {
    if (open && step === "art" && art.status === "idle") void runArt(artStyle);
  }, [open, step, art.status, runArt, artStyle]);

  /* ── 내비게이션 ── */
  const canNext = useMemo(() => {
    if (finishing) return false;
    switch (step) {
      case "file":
        return !!file;
      case "lyrics":
        return true;
      case "sync":
        return sync.status === "done" || sync.status === "skipped";
      case "art":
        return art.status !== "working";
      case "album":
        return (
          upload.status === "done" &&
          (albumChoice !== NEW_ALBUM || newAlbum.trim().length > 0)
        );
    }
  }, [step, file, sync.status, art.status, upload.status, albumChoice, newAlbum, finishing]);

  function goNext() {
    if (!canNext) return;
    if (step === "file" && (upload.status === "idle" || upload.status === "error") && file) {
      startUpload(file);
    }
    setStep(steps[Math.min(stepIdx + 1, steps.length - 1)]);
  }

  function goBack() {
    if (stepIdx === 0 || finishing) return;
    setStep(steps[stepIdx - 1]);
  }

  /* ── ⑤ 완료 — 커버는 Storage 업로드(멱등) 후, 가사·앨범·공개·커버를
        단일 updateDoc 으로 원자 반영. 부분 실패로 공개 누락 등이 안 생기게. ── */
  async function finish() {
    if (!uploadResult || finishing || !uid) return;
    const id = uploadResult.id;
    setFinishing(true);
    try {
      const finalLyrics = isLrcPaste
        ? lyricsText.trim()
        : sync.status === "done" && sync.lines?.length
          ? buildLrc(sync.lines)
          : lyricsText.trim();
      const finalAlbum = albumChoice === NEW_ALBUM ? newAlbum.trim() : albumChoice;

      // 커버 — Storage 에 먼저 올린다(실패해도 메타는 진행). 이미 올렸으면 재사용(재시도 멱등).
      let cover: { coverUrl: string; coverPath: string } | null = null;
      if (art.status === "done" && art.blob) {
        const cached = coverUploadedRef.current;
        if (cached && cached.id === id) {
          cover = { coverUrl: cached.coverUrl, coverPath: cached.coverPath };
        } else {
          cover = await uploadTrackCover(uid, id, art.blob);
          coverUploadedRef.current = { id, ...cover };
        }
      }

      await finalizeTrack(id, {
        ...(finalLyrics ? { lyrics: finalLyrics } : {}),
        album: finalAlbum,
        visibility,
        ...(cover ? { coverUrl: cover.coverUrl, coverPath: cover.coverPath } : {}),
      });

      addToast({
        type: "success",
        message: `「${title}」 등록 완료${finalAlbum ? ` — 앨범 「${finalAlbum}」` : ""}`,
        duration: 5000,
      });
      onClose();
    } catch (e) {
      addToast({
        type: "error",
        message: e instanceof Error ? e.message : "등록 마무리에 실패했습니다 — 다시 시도해 주세요",
      });
    } finally {
      setFinishing(false);
    }
  }

  /* ── 닫기 가드 — 업로드된 곡 처리 안내 ── */
  function requestClose() {
    if (finishing) return;
    if (upload.status === "working" || upload.status === "done") {
      openDialog({
        title: "등록을 중단할까요?",
        description:
          upload.status === "working"
            ? "업로드는 백그라운드에서 마무리되고, 곡은 보관함에 비공개 싱글로 남아요. 가사·커버는 저장되지 않습니다."
            : "업로드된 곡은 보관함에 비공개 싱글로 남아요. 가사·커버는 저장되지 않습니다.",
        confirmLabel: "중단",
        variant: "danger",
        onConfirm: () => onClose(),
      });
      return;
    }
    onClose();
  }

  /* 단계별 건너뛰기 버튼 */
  const skipAction = useMemo(() => {
    if (step === "sync" && sync.status !== "done") {
      return {
        label: "건너뛰기 (정적 가사)",
        run: () => {
          syncedForRef.current = lyricsText;
          setSync({ status: "skipped" });
          setStep(steps[Math.min(stepIdx + 1, steps.length - 1)]);
        },
      };
    }
    if (step === "art" && art.status !== "done") {
      return {
        label: "기본 아트 사용",
        run: () => {
          setArt((prev) => {
            if (prev.previewUrl) URL.revokeObjectURL(prev.previewUrl);
            artUrlRef.current = null;
            return { status: "skipped" };
          });
          setStep(steps[Math.min(stepIdx + 1, steps.length - 1)]);
        },
      };
    }
    return null;
  }, [step, sync.status, art.status, lyricsText, steps, stepIdx]);

  const meta = STEP_META[step];

  return (
    <Transition show={open} as={Fragment}>
      <Dialog onClose={requestClose} className="relative z-50">
        <TransitionChild
          as={Fragment}
          enter="ease-out duration-200"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-150"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black/40 backdrop-blur-[2px]" />
        </TransitionChild>

        <div className="fixed inset-0 flex items-end justify-center sm:items-center sm:p-4">
          <TransitionChild
            as={Fragment}
            enter="ease-out duration-250"
            enterFrom="opacity-0 translate-y-full sm:translate-y-6 sm:scale-95"
            enterTo="opacity-100 translate-y-0 sm:scale-100"
            leave="ease-in duration-150"
            leaveFrom="opacity-100 translate-y-0 sm:scale-100"
            leaveTo="opacity-0 translate-y-full sm:translate-y-6 sm:scale-95"
          >
            <DialogPanel className="flex max-h-[94dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-3xl bg-surface-primary shadow-2xl sm:rounded-3xl">
              {/* ── 히어로 헤더 — 단계 인디케이터 ── */}
              <div className="dash-hero shrink-0 px-6 pb-5 pt-5" style={{ borderRadius: 0, boxShadow: "none" }}>
                <div className="dash-hero__content">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <DialogTitle className="text-lg font-bold tracking-tight text-white">
                        곡 등록 위자드
                      </DialogTitle>
                      <p className="mt-0.5 truncate text-xs text-white/75">
                        {stepIdx + 1}/{steps.length} · {meta.label} — {meta.desc}
                      </p>
                    </div>
                    <button
                      onClick={requestClose}
                      aria-label="닫기"
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white/80 transition-colors hover:bg-white/10 hover:text-white"
                    >
                      <X className="h-5 w-5" />
                    </button>
                  </div>

                  {/* 단계 칩 + 커넥터 — 커넥터도 <li>(aria-hidden)로 감싸 ol 구조 유효 */}
                  <ol className="mt-4 flex items-center" aria-label="등록 단계">
                    {steps.map((id, i) => {
                      const Icon = STEP_META[id].icon;
                      const state = i < stepIdx ? "done" : i === stepIdx ? "active" : "todo";
                      const stateLabel =
                        state === "done" ? "완료" : state === "active" ? "진행 중" : "예정";
                      return (
                        <Fragment key={id}>
                          {i > 0 && (
                            <li
                              aria-hidden="true"
                              className={cn(
                                "mx-1.5 h-0.5 flex-1 rounded-full transition-colors duration-300",
                                i <= stepIdx ? "bg-white/80" : "bg-white/20"
                              )}
                            />
                          )}
                          <li
                            aria-current={state === "active" ? "step" : undefined}
                            className={cn(
                              "flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-all duration-300",
                              state === "done" && "bg-white text-bora-700",
                              state === "active" &&
                                "bg-white text-bora-700 ring-4 ring-white/30 scale-110",
                              state === "todo" && "bg-white/15 text-white/65 ring-1 ring-white/20"
                            )}
                          >
                            {state === "done" ? (
                              <Check className="h-4 w-4" aria-hidden="true" strokeWidth={3} />
                            ) : (
                              <Icon className="h-4 w-4" aria-hidden="true" />
                            )}
                            <span className="sr-only">{`${i + 1}단계 ${STEP_META[id].label} (${stateLabel})`}</span>
                          </li>
                        </Fragment>
                      );
                    })}
                  </ol>
                </div>
              </div>

              {/* ── 본문 ── */}
              <div className="flex-1 overflow-y-auto px-6 py-5" style={{ scrollbarWidth: "thin" }}>
                <AnimatePresence mode="wait" initial={false}>
                  <motion.div key={step} {...stepMotion}>
                    {step === "file" && (
                      <StepFile
                        file={file}
                        dragOver={dragOver}
                        setDragOver={setDragOver}
                        upload={upload}
                        locked={upload.status === "working" || upload.status === "done"}
                        keepLossless={keepLossless}
                        onKeepLosslessChange={setKeepLossless}
                        onPickClick={() => inputRef.current?.click()}
                        onDropFile={pickFile}
                        onClear={() => setFile(null)}
                        onRetry={() => file && startUpload(file)}
                        onSwitchToBulk={onSwitchToBulk}
                      />
                    )}
                    {step === "lyrics" && (
                      <StepLyrics
                        value={lyricsText}
                        onChange={setLyricsText}
                        isLrc={isLrcPaste}
                      />
                    )}
                    {step === "sync" && (
                      <StepSync
                        upload={upload}
                        ready={!!uploadResult}
                        sync={sync}
                        onRetry={() => void runSync()}
                      />
                    )}
                    {step === "art" && (
                      <StepArt
                        title={title}
                        trackId={uploadResult?.id ?? "pending"}
                        art={art}
                        style={artStyle}
                        onSelectStyle={selectArtStyle}
                        onRegenerate={() => void runArt(artStyle)}
                      />
                    )}
                    {step === "album" && (
                      <StepAlbum
                        title={title}
                        file={file}
                        upload={upload}
                        uploadResult={uploadResult}
                        artPreview={art.status === "done" ? art.previewUrl ?? null : null}
                        lyricsBadge={
                          !hasLyrics
                            ? null
                            : isLrcPaste || sync.status === "done"
                              ? "싱크 가사"
                              : "정적 가사"
                        }
                        albums={albums}
                        albumChoice={albumChoice}
                        setAlbumChoice={setAlbumChoice}
                        newAlbum={newAlbum}
                        setNewAlbum={setNewAlbum}
                        visibility={visibility}
                        setVisibility={setVisibility}
                        onRetryUpload={() => file && startUpload(file)}
                      />
                    )}
                  </motion.div>
                </AnimatePresence>
              </div>

              {/* ── 푸터 ── */}
              <div className="flex shrink-0 items-center justify-between gap-3 border-t border-base px-6 py-4">
                <UploadPill upload={upload} />
                <div className="flex shrink-0 items-center gap-2">
                  {stepIdx > 0 && (
                    <button
                      onClick={goBack}
                      disabled={finishing}
                      className="rounded-xl px-3.5 py-2.5 text-sm font-medium text-body transition-colors hover:bg-surface-secondary disabled:opacity-50"
                    >
                      이전
                    </button>
                  )}
                  {skipAction && (
                    <button
                      onClick={skipAction.run}
                      className="rounded-xl border border-strong bg-surface-primary px-3.5 py-2.5 text-sm font-medium text-body transition-colors hover:bg-surface-secondary"
                    >
                      {skipAction.label}
                    </button>
                  )}
                  {isLast ? (
                    <button
                      onClick={() => void finish()}
                      disabled={!canNext}
                      className="flex items-center gap-2 rounded-xl bg-bora-600 px-5 py-2.5 text-sm font-semibold text-white shadow-bora-glow transition-colors hover:bg-bora-700 disabled:opacity-50"
                    >
                      {finishing ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Sparkles className="h-4 w-4" />
                      )}
                      {finishing ? "마무리 중…" : "등록 완료"}
                    </button>
                  ) : (
                    <button
                      onClick={goNext}
                      disabled={!canNext}
                      className="rounded-xl bg-bora-600 px-5 py-2.5 text-sm font-semibold text-white shadow-bora-glow transition-colors hover:bg-bora-700 disabled:opacity-50"
                    >
                      다음
                    </button>
                  )}
                </div>
              </div>

              <input
                ref={inputRef}
                type="file"
                accept={ACCEPT}
                className="hidden"
                aria-label="오디오 파일 선택"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) pickFile(f);
                  e.target.value = "";
                }}
              />
            </DialogPanel>
          </TransitionChild>
        </div>
      </Dialog>
    </Transition>
  );
}

/* ── 푸터 좌측 업로드 상태 필 ── */
function UploadPill({ upload }: { upload: UploadStatus }) {
  if (upload.status === "idle") return <span />;
  return (
    <span
      className={cn(
        "flex min-w-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium",
        upload.status === "working" && "bg-bora-50 text-bora-700",
        upload.status === "done" && "bg-emerald-50 text-emerald-700",
        upload.status === "error" && "bg-red-50 text-red-600"
      )}
      aria-live="polite"
    >
      {upload.status === "working" && (
        <>
          <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
          <span className="truncate">
            {PHASE_LABEL[upload.phase ?? "probe"]}
            {upload.pct > 0 && ` ${upload.pct}%`}
          </span>
        </>
      )}
      {upload.status === "done" && (
        <>
          <Check className="h-3.5 w-3.5 shrink-0" strokeWidth={3} />
          <span className="truncate">업로드 완료</span>
        </>
      )}
      {upload.status === "error" && (
        <>
          <X className="h-3.5 w-3.5 shrink-0" strokeWidth={3} />
          <span className="truncate">{upload.error ?? "업로드 실패"}</span>
        </>
      )}
    </span>
  );
}

/* ══════════ ① 곡 업로드 ══════════ */
function StepFile({
  file,
  dragOver,
  setDragOver,
  upload,
  locked,
  keepLossless,
  onKeepLosslessChange,
  onPickClick,
  onDropFile,
  onClear,
  onRetry,
  onSwitchToBulk,
}: {
  file: File | null;
  dragOver: boolean;
  setDragOver: (v: boolean) => void;
  upload: UploadStatus;
  locked: boolean;
  keepLossless: boolean;
  onKeepLosslessChange: (v: boolean) => void;
  onPickClick: () => void;
  onDropFile: (f: File) => void;
  onClear: () => void;
  onRetry: () => void;
  onSwitchToBulk?: () => void;
}) {
  return (
    <div className="space-y-4">
      {!file ? (
        <button
          type="button"
          onClick={onPickClick}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            const f = e.dataTransfer.files?.[0];
            if (f) onDropFile(f);
          }}
          className={cn(
            "flex w-full flex-col items-center justify-center gap-3 rounded-3xl border-2 border-dashed px-6 py-14 text-center transition-all",
            dragOver
              ? "scale-[1.01] border-bora-400 bg-bora-50"
              : "border-strong bg-surface-secondary/60 hover:border-bora-300 hover:bg-bora-50/50"
          )}
        >
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-bora-50 text-bora-600 shadow-bora-glow">
            <Upload className="h-7 w-7" />
          </div>
          <div>
            <p className="text-sm font-semibold text-heading">
              오디오 파일을 끌어다 놓거나 클릭해서 선택
            </p>
            <p className="mt-1 text-xs text-caption">
              WAV · MP3 · M4A · AAC · OGG · FLAC — 한 곡씩 정성껏
            </p>
          </div>
        </button>
      ) : (
        <div className="flex items-center gap-4 rounded-2xl border border-strong bg-surface-secondary/60 p-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-bora-50 text-bora-600">
            <FileAudio className="h-6 w-6" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-heading">{file.name}</p>
            <p className="mt-0.5 flex items-center gap-1.5 text-xs text-caption">
              {formatBytes(file.size)}
              <span className="rounded-full bg-surface-primary px-2 py-0.5 text-[10px] font-bold uppercase ring-1 ring-strong">
                {extOf(file.name).slice(1)}
              </span>
              {file && isConvertible(file.name) && (
                <span className="text-[11px]">
                  {keepLossless ? "→ 원본 무손실 그대로" : "→ 스트리밍용 mp3 자동 생성"}
                </span>
              )}
            </p>
          </div>
          {!locked && (
            <button
              onClick={onClear}
              aria-label="파일 다시 선택"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-caption transition-colors hover:bg-surface-tertiary hover:text-body"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      )}

      {/* 음질 선택 — WAV/FLAC 만 (변환 대상) */}
      {file && isConvertible(file.name) && (
        <div>
          <p className="mb-1.5 text-xs font-medium text-heading">음질</p>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => !locked && onKeepLosslessChange(false)}
              disabled={locked}
              aria-pressed={!keepLossless}
              className={cn(
                "rounded-xl border px-3 py-2.5 text-left transition-all disabled:opacity-60",
                !keepLossless
                  ? "border-bora-300 bg-bora-50 ring-1 ring-bora-300"
                  : "border-strong bg-surface-primary hover:bg-surface-secondary"
              )}
            >
              <span className={cn("block text-sm font-semibold", !keepLossless ? "text-bora-700" : "text-heading")}>
                스트리밍 최적 (mp3)
              </span>
              <span className="block text-[11px] text-caption">용량↓·빠른 재생 · 원본도 보관</span>
            </button>
            <button
              type="button"
              onClick={() => !locked && onKeepLosslessChange(true)}
              disabled={locked}
              aria-pressed={keepLossless}
              className={cn(
                "rounded-xl border px-3 py-2.5 text-left transition-all disabled:opacity-60",
                keepLossless
                  ? "border-bora-300 bg-bora-50 ring-1 ring-bora-300"
                  : "border-strong bg-surface-primary hover:bg-surface-secondary"
              )}
            >
              <span className={cn("block text-sm font-semibold", keepLossless ? "text-bora-700" : "text-heading")}>
                원본 무손실 (WAV)
              </span>
              <span className="block text-[11px] text-caption">변환 없이 원본 그대로 재생</span>
            </button>
          </div>
        </div>
      )}

      {upload.status === "error" && (
        <div className="flex items-center justify-between gap-3 rounded-2xl bg-red-50 px-4 py-3">
          <p className="min-w-0 truncate text-sm text-red-600">{upload.error}</p>
          <button
            onClick={onRetry}
            className="flex shrink-0 items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-red-600 ring-1 ring-red-200 hover:bg-red-100"
          >
            <RefreshCw className="h-3 w-3" /> 다시 시도
          </button>
        </div>
      )}

      <p className="text-xs text-caption">
        다음을 누르면 업로드가 <strong className="font-semibold text-body">뒤에서 진행</strong>되고,
        그동안 가사와 커버를 준비할 수 있어요.
        {onSwitchToBulk && (
          <>
            {" "}여러 곡을 빠르게 올리려면{" "}
            <button
              onClick={onSwitchToBulk}
              className="font-semibold text-bora-600 underline-offset-2 hover:underline"
            >
              일괄 등록
            </button>
            을 쓰세요.
          </>
        )}
      </p>
    </div>
  );
}

/* ══════════ ② 가사 ══════════ */
function StepLyrics({
  value,
  onChange,
  isLrc,
}: {
  value: string;
  onChange: (v: string) => void;
  isLrc: boolean;
}) {
  return (
    <div className="space-y-3">
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={11}
        autoFocus
        placeholder={"가사를 한 줄에 한 소절씩 붙여넣으세요.\n\n파도가 밀려오는 새벽\n조용히 눈을 떠\n\n(간주는 빈 줄로 — 비워두면 가사 없이 등록돼요)"}
        aria-label="가사 내용"
        className="w-full resize-y rounded-2xl border border-strong bg-surface-primary px-4 py-3.5 text-sm leading-relaxed text-heading outline-none transition-colors placeholder:text-caption focus:border-bora-500 focus:ring-1 focus:ring-bora-500"
      />
      {isLrc ? (
        <p className="flex items-center gap-1.5 rounded-xl bg-emerald-50 px-3.5 py-2.5 text-xs font-medium text-emerald-700">
          <Check className="h-3.5 w-3.5 shrink-0" strokeWidth={3} />
          타임스탬프(LRC)가 감지됐어요 — AI 싱크 없이 바로 싱크 가사로 저장됩니다
        </p>
      ) : value.trim() ? (
        <p className="flex items-center gap-1.5 rounded-xl bg-bora-50 px-3.5 py-2.5 text-xs font-medium text-bora-700">
          <Sparkles className="h-3.5 w-3.5 shrink-0" />
          다음 단계에서 AI 가 줄마다 타이밍을 자동으로 맞춰드려요
        </p>
      ) : (
        <p className="text-xs text-caption">
          가사 없이 진행해도 돼요 — 나중에 재생 화면에서 언제든 등록할 수 있어요.
        </p>
      )}
    </div>
  );
}

/* ══════════ ③ AI 싱크 ══════════ */
function StepSync({
  upload,
  ready,
  sync,
  onRetry,
}: {
  upload: UploadStatus;
  ready: boolean;
  sync: SyncStatus;
  onRetry: () => void;
}) {
  if (!ready) {
    return (
      <WaitCard
        icon={UploadCloud}
        title="음원을 준비하는 중이에요"
        desc={`${PHASE_LABEL[upload.phase ?? "probe"]}${upload.pct > 0 ? ` ${upload.pct}%` : ""} — 업로드가 끝나면 AI 싱크가 자동으로 시작돼요`}
        error={upload.status === "error" ? upload.error : undefined}
      />
    );
  }

  if (sync.status === "working" || sync.status === "idle") {
    return (
      <WaitCard
        icon={AudioLines}
        title="AI 가 가사 타이밍을 맞추는 중…"
        desc="Whisper 가 보컬을 듣고 줄마다 타임스탬프를 찍어요 (보통 10~40초)"
        pulse
      />
    );
  }

  if (sync.status === "error") {
    return (
      <div className="space-y-3">
        <div className="rounded-2xl bg-red-50 px-4 py-4">
          <p className="text-sm font-semibold text-red-600">AI 싱크에 실패했어요</p>
          <p className="mt-1 text-xs text-red-500">{sync.error}</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={onRetry}
            className="flex items-center gap-1.5 rounded-xl bg-bora-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-bora-700"
          >
            <RefreshCw className="h-4 w-4" /> 다시 시도
          </button>
        </div>
        <p className="text-xs text-caption">
          건너뛰면 정적 가사로 저장돼요 — 재생 화면의 탭-싱크 에디터로 직접 찍을 수도 있어요.
        </p>
      </div>
    );
  }

  if (sync.status === "skipped") {
    return (
      <WaitCard
        icon={MicVocal}
        title="싱크를 건너뛰었어요"
        desc="가사는 정적 텍스트로 저장돼요 — 다음을 눌러 계속하세요"
      />
    );
  }

  /* done — 타임라인 미리보기 */
  return (
    <div className="space-y-3">
      <p className="flex items-center gap-1.5 rounded-xl bg-emerald-50 px-3.5 py-2.5 text-xs font-medium text-emerald-700">
        <Check className="h-3.5 w-3.5 shrink-0" strokeWidth={3} />
        {sync.lines?.length}줄 타이밍 완성 — 줄별 ±0.2s 미세조정은 재생 화면 가사 에디터에서
      </p>
      <ul
        className="max-h-72 space-y-0.5 overflow-y-auto rounded-2xl border border-strong bg-surface-secondary/40 p-2"
        style={{ scrollbarWidth: "thin" }}
      >
        {sync.lines?.map((l, i) => (
          <li key={i} className="flex items-center gap-2.5 rounded-lg px-2.5 py-1.5">
            <span className="shrink-0 rounded-md bg-bora-50 px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-bora-700">
              {l.time != null ? formatLrcTime(l.time).slice(1, -1) : "—"}
            </span>
            <span className="min-w-0 flex-1 truncate text-sm text-heading">
              {l.text || <span className="text-caption">♪ (간주)</span>}
            </span>
          </li>
        ))}
      </ul>
      <button
        onClick={onRetry}
        className="flex items-center gap-1.5 rounded-xl border border-strong bg-surface-primary px-3.5 py-2 text-xs font-medium text-body transition-colors hover:bg-surface-secondary"
      >
        <RefreshCw className="h-3.5 w-3.5" /> 다시 분석
      </button>
    </div>
  );
}

/* ══════════ ④ AI 커버 (스타일 선택) ══════════ */
function StepArt({
  title,
  trackId,
  art,
  style,
  onSelectStyle,
  onRegenerate,
}: {
  title: string;
  trackId: string;
  art: ArtStatus;
  style: string;
  onSelectStyle: (id: string) => void;
  onRegenerate: () => void;
}) {
  const working = art.status === "working" || art.status === "idle";
  return (
    <div className="flex flex-col items-center gap-4">
      {/* 프리뷰 — 생성 중 셔머 / 완성 이미지 / 폴백 SVG */}
      <div className="relative h-52 w-52 overflow-hidden rounded-3xl shadow-lg ring-1 ring-black/5 sm:h-56 sm:w-56">
        {working ? (
          <div className="flex h-full w-full animate-pulse flex-col items-center justify-center gap-3 bg-gradient-to-br from-bora-100 via-indigo-100 to-bora-50">
            <Palette className="h-10 w-10 text-bora-400" />
            <Loader2 className="h-5 w-5 animate-spin text-bora-500" />
          </div>
        ) : art.status === "done" && art.previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- 생성 직후 로컬 blob 미리보기
          <img
            src={art.previewUrl}
            alt={`「${title}」 AI 생성 커버 미리보기`}
            className="h-full w-full object-cover"
          />
        ) : (
          <TrackArtwork trackId={trackId} />
        )}
      </div>

      {/* 스타일 선택 — 칩 탭하면 그 스타일로 즉시 다시 그림 */}
      <div className="w-full">
        <p className="mb-2 text-center text-xs font-medium text-caption">
          스타일을 골라 보세요 {working && "· 그리는 중…"}
        </p>
        <CoverStylePicker value={style} onSelect={onSelectStyle} disabled={working} />
      </div>

      {working ? (
        <p className="text-center text-xs text-caption">
          「{title}」에 어울리는 <strong className="font-semibold text-body">AI 커버</strong>를
          그리는 중… 보통 10~30초 걸려요
        </p>
      ) : art.status === "done" ? (
        <div className="flex flex-col items-center gap-2">
          <p className="flex items-center gap-1.5 text-xs font-medium text-emerald-700">
            <Check className="h-3.5 w-3.5" strokeWidth={3} /> 커버 완성 — 스타일을 바꾸거나 다시 그려보세요
          </p>
          <button
            onClick={onRegenerate}
            className="flex items-center gap-1.5 rounded-xl border border-strong bg-surface-primary px-4 py-2 text-xs font-medium text-body transition-colors hover:bg-surface-secondary"
          >
            <RefreshCw className="h-3.5 w-3.5" /> 같은 스타일로 다시
          </button>
        </div>
      ) : art.status === "error" ? (
        <div className="w-full space-y-2 text-center">
          <p className="text-sm font-semibold text-red-600">커버 생성에 실패했어요</p>
          <p className="text-xs text-red-500">{art.error}</p>
          <p className="text-xs text-caption">
            건너뛰면 곡마다 고유한 기본 아트(그라데이션)가 쓰여요.
          </p>
        </div>
      ) : (
        /* skipped */
        <p className="text-center text-xs text-caption">
          기본 아트를 사용해요 — 위에서 스타일을 누르면 AI 커버를 만들 수 있어요.
        </p>
      )}
    </div>
  );
}

/* ══════════ ⑤ 앨범 맵핑 + 공개 ══════════ */
function StepAlbum({
  title,
  file,
  upload,
  uploadResult,
  artPreview,
  lyricsBadge,
  albums,
  albumChoice,
  setAlbumChoice,
  newAlbum,
  setNewAlbum,
  visibility,
  setVisibility,
  onRetryUpload,
}: {
  title: string;
  file: File | null;
  upload: UploadStatus;
  uploadResult: UploadResult | null;
  artPreview: string | null;
  lyricsBadge: string | null;
  albums: string[];
  albumChoice: string;
  setAlbumChoice: (v: string) => void;
  newAlbum: string;
  setNewAlbum: (v: string) => void;
  visibility: Visibility;
  setVisibility: (v: Visibility) => void;
  onRetryUpload: () => void;
}) {
  return (
    <div className="space-y-5">
      {/* 요약 카드 */}
      <div className="flex items-center gap-4 rounded-2xl border border-strong bg-surface-secondary/60 p-4">
        <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-2xl shadow-md">
          {artPreview ? (
            // eslint-disable-next-line @next/next/no-img-element -- 로컬 blob 미리보기
            <img src={artPreview} alt="" className="h-full w-full object-cover" />
          ) : (
            <TrackArtwork trackId={uploadResult?.id ?? "pending"} />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-bold text-heading">{title}</p>
          <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-caption">
            {uploadResult && uploadResult.duration > 0 && (
              <span>{formatTime(uploadResult.duration)}</span>
            )}
            {file && (
              <span className="rounded-full bg-surface-primary px-2 py-0.5 text-[10px] font-bold uppercase ring-1 ring-strong">
                {extOf(file.name).slice(1)}
              </span>
            )}
            {lyricsBadge && (
              <span className="flex items-center gap-1 rounded-full bg-bora-50 px-2 py-0.5 text-[10px] font-semibold text-bora-700">
                <MicVocal className="h-2.5 w-2.5" /> {lyricsBadge}
              </span>
            )}
            {artPreview && (
              <span className="flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                <Palette className="h-2.5 w-2.5" /> AI 커버
              </span>
            )}
          </p>
        </div>
      </div>

      {/* 업로드가 아직이면 안내 */}
      {upload.status === "working" && (
        <p className="flex items-center gap-2 rounded-xl bg-bora-50 px-3.5 py-2.5 text-xs font-medium text-bora-700" aria-live="polite">
          <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
          {PHASE_LABEL[upload.phase ?? "upload"]}
          {upload.pct > 0 && ` ${upload.pct}%`} — 끝나면 바로 등록을 마칠 수 있어요
        </p>
      )}
      {upload.status === "error" && (
        <div className="flex items-center justify-between gap-3 rounded-xl bg-red-50 px-3.5 py-2.5">
          <p className="min-w-0 truncate text-xs font-medium text-red-600">{upload.error}</p>
          <button
            onClick={onRetryUpload}
            className="flex shrink-0 items-center gap-1 rounded-lg bg-white px-2.5 py-1 text-[11px] font-semibold text-red-600 ring-1 ring-red-200 hover:bg-red-100"
          >
            <RefreshCw className="h-3 w-3" /> 재시도
          </button>
        </div>
      )}

      {/* 앨범 선택 카드 */}
      <div>
        <p className="mb-2 text-sm font-medium text-heading">앨범에 담기</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <AlbumCard
            label="싱글"
            desc="앨범 없음"
            icon={Music2}
            selected={albumChoice === ""}
            onSelect={() => setAlbumChoice("")}
          />
          {albums.map((a) => (
            <AlbumCard
              key={a}
              label={a}
              desc="기존 앨범"
              icon={Disc3}
              selected={albumChoice === a}
              onSelect={() => setAlbumChoice(a)}
            />
          ))}
          <AlbumCard
            label="새 앨범"
            desc="이름 짓기"
            icon={FolderPlus}
            selected={albumChoice === NEW_ALBUM}
            onSelect={() => setAlbumChoice(NEW_ALBUM)}
          />
        </div>
        {albumChoice === NEW_ALBUM && (
          <input
            type="text"
            value={newAlbum}
            onChange={(e) => setNewAlbum(e.target.value)}
            placeholder="새 앨범 이름"
            aria-label="새 앨범 이름"
            autoFocus
            className="mt-2 w-full rounded-xl border border-strong bg-surface-primary px-4 py-2.5 text-sm text-heading outline-none transition-colors placeholder:text-caption focus:border-bora-500 focus:ring-1 focus:ring-bora-500"
          />
        )}
      </div>

      {/* 공개 설정 — 세그먼트 */}
      <div>
        <p className="mb-2 text-sm font-medium text-heading">공개 설정</p>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setVisibility("public")}
            aria-pressed={visibility === "public"}
            className={cn(
              "flex items-center gap-2.5 rounded-2xl border px-4 py-3 text-left transition-all",
              visibility === "public"
                ? "border-bora-300 bg-bora-50 ring-1 ring-bora-300"
                : "border-strong bg-surface-primary hover:bg-surface-secondary"
            )}
          >
            <Globe className={cn("h-4.5 w-4.5 shrink-0", visibility === "public" ? "text-bora-600" : "text-caption")} />
            <span className="min-w-0">
              <span className={cn("block text-sm font-semibold", visibility === "public" ? "text-bora-700" : "text-heading")}>공개</span>
              <span className="block truncate text-[11px] text-caption">둘러보기에서 모두 감상</span>
            </span>
          </button>
          <button
            type="button"
            onClick={() => setVisibility("private")}
            aria-pressed={visibility === "private"}
            className={cn(
              "flex items-center gap-2.5 rounded-2xl border px-4 py-3 text-left transition-all",
              visibility === "private"
                ? "border-amber-300 bg-amber-50 ring-1 ring-amber-300"
                : "border-strong bg-surface-primary hover:bg-surface-secondary"
            )}
          >
            <Lock className={cn("h-4.5 w-4.5 shrink-0", visibility === "private" ? "text-amber-600" : "text-caption")} />
            <span className="min-w-0">
              <span className={cn("block text-sm font-semibold", visibility === "private" ? "text-amber-700" : "text-heading")}>비공개</span>
              <span className="block truncate text-[11px] text-caption">나만 들을 수 있어요</span>
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}

/* 앨범 선택 카드 */
function AlbumCard({
  label,
  desc,
  icon: Icon,
  selected,
  onSelect,
}: {
  label: string;
  desc: string;
  icon: LucideIcon;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        "flex items-center gap-2.5 rounded-2xl border px-3.5 py-3 text-left transition-all",
        selected
          ? "border-bora-300 bg-bora-50 ring-1 ring-bora-300"
          : "border-strong bg-surface-primary hover:-translate-y-0.5 hover:bg-surface-secondary hover:shadow-sm"
      )}
    >
      <span
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-xl",
          selected ? "bg-bora-600 text-white" : "bg-surface-secondary text-bora-600"
        )}
      >
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0">
        <span className={cn("block truncate text-sm font-semibold", selected ? "text-bora-700" : "text-heading")}>
          {label}
        </span>
        <span className="block truncate text-[11px] text-caption">{desc}</span>
      </span>
    </button>
  );
}

/* 대기/안내 카드 공용 */
function WaitCard({
  icon: Icon,
  title,
  desc,
  error,
  pulse,
}: {
  icon: LucideIcon;
  title: string;
  desc: string;
  error?: string;
  pulse?: boolean;
}) {
  return (
    <div className="flex flex-col items-center gap-4 rounded-3xl border border-strong bg-surface-secondary/50 px-6 py-12 text-center">
      <div
        className={cn(
          "flex h-14 w-14 items-center justify-center rounded-2xl bg-bora-50 text-bora-600",
          pulse && "animate-pulse"
        )}
      >
        <Icon className="h-7 w-7" />
      </div>
      <div>
        <p className="text-sm font-semibold text-heading">{title}</p>
        <p className="mt-1 text-xs text-caption">{desc}</p>
        {error && <p className="mt-2 text-xs font-medium text-red-600">{error}</p>}
      </div>
      {pulse && <Loader2 className="h-5 w-5 animate-spin text-bora-500" />}
    </div>
  );
}
