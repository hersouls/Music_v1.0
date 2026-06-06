"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePlayerStore } from "@/stores/usePlayerStore";
import { useToastStore } from "@/stores/useToastStore";
import { parseLyrics, activeLineIndex, type ParsedLyrics } from "@/lib/lrc";
import { cn } from "@/lib/utils";
import Modal from "@/components/ui/Modal";
import type { Track } from "@/types/music";
import {
  MicVocal,
  ClipboardPaste,
  CloudDownload,
  Loader2,
  Pencil,
  Trash2,
} from "lucide-react";

/* ───────────────────────────────────────────
   LyricsPanel — NowPlaying 가사 뷰
   .lrc 싱크 가사: 재생 위치 하이라이트 + 자동 스크롤 +
   줄 클릭 시킹. .txt 는 정적 표시.
   등록: 붙여넣기(LRC 자동 감지) / Suno 가져오기(suno-cli).
   ─────────────────────────────────────────── */

type Status = "loading" | "none" | "loaded";

export default function LyricsPanel({ track }: { track: Track }) {
  const currentTime = usePlayerStore((s) => s.currentTime);
  const seek = usePlayerStore((s) => s.seek);
  const addToast = useToastStore((s) => s.addToast);

  const [status, setStatus] = useState<Status>("loading");
  const [raw, setRaw] = useState("");
  const [parsed, setParsed] = useState<ParsedLyrics | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [fetching, setFetching] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const lineRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const userScrollUntil = useRef(0);

  const load = useCallback(async () => {
    setStatus("loading");
    try {
      const res = await fetch(`/api/lyrics/${track.id}`);
      if (!res.ok) {
        setStatus("none");
        setParsed(null);
        setRaw("");
        return;
      }
      const data = (await res.json()) as { content: string };
      setRaw(data.content);
      setParsed(parseLyrics(data.content));
      setStatus("loaded");
    } catch {
      setStatus("none");
    }
  }, [track.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const activeIdx = useMemo(
    () => (parsed?.synced ? activeLineIndex(parsed.lines, currentTime) : -1),
    [parsed, currentTime]
  );

  /* 활성 라인 자동 스크롤 — 사용자가 직접 스크롤 중이면 3초간 양보 */
  useEffect(() => {
    if (activeIdx < 0) return;
    if (Date.now() < userScrollUntil.current) return;
    const container = containerRef.current;
    const line = lineRefs.current[activeIdx];
    if (!container || !line) return;
    container.scrollTo({
      top: line.offsetTop - container.clientHeight / 2 + line.clientHeight / 2,
      behavior: "smooth",
    });
  }, [activeIdx]);

  function markUserScroll() {
    userScrollUntil.current = Date.now() + 3000;
  }

  async function fetchFromSuno() {
    if (fetching) return;
    setFetching(true);
    try {
      const res = await fetch(`/api/lyrics/${track.id}/suno`, { method: "POST" });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error || "가져오기에 실패했습니다");
      addToast({ type: "success", message: "Suno 싱크 가사를 가져왔습니다" });
      await load();
    } catch (e) {
      addToast({
        type: "error",
        message: e instanceof Error ? e.message : "가져오기에 실패했습니다",
        duration: 5000,
      });
    } finally {
      setFetching(false);
    }
  }

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col">
      {/* 컴팩트 곡 제목 */}
      <p className="shrink-0 truncate pb-3 text-center text-sm font-bold text-white/90">
        {track.title}
        <span className="ml-2 text-xs font-medium text-white/50">
          {parsed?.synced ? "싱크 가사" : parsed ? "가사" : ""}
        </span>
      </p>

      {status === "loading" && (
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-white/60" />
        </div>
      )}

      {status === "none" && (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/20">
            <MicVocal className="h-7 w-7 text-white/70" />
          </div>
          <div>
            <p className="text-sm font-semibold text-white/90">아직 가사가 없습니다</p>
            <p className="mt-1 text-xs text-white/60">
              LRC(타임스탬프) 가사를 붙여넣으면 싱크 하이라이트로 표시돼요
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <button
              onClick={() => setEditOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-full bg-white px-4 py-2 text-xs font-bold text-bora-700 shadow-lg shadow-black/10 transition-all hover:scale-[1.04] active:scale-95"
            >
              <ClipboardPaste className="h-3.5 w-3.5" />
              가사 붙여넣기
            </button>
            {track.sunoId && (
              <button
                onClick={fetchFromSuno}
                disabled={fetching}
                className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-4 py-2 text-xs font-bold text-white ring-1 ring-white/25 backdrop-blur-sm transition-colors hover:bg-white/25 disabled:opacity-50"
              >
                {fetching ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <CloudDownload className="h-3.5 w-3.5" />
                )}
                Suno에서 가져오기
              </button>
            )}
          </div>
        </div>
      )}

      {status === "loaded" && parsed && (
        <>
          <div
            ref={containerRef}
            onWheel={markUserScroll}
            onTouchMove={markUserScroll}
            className="min-h-0 flex-1 overflow-y-auto px-2 py-4 [mask-image:linear-gradient(to_bottom,transparent,black_12%,black_88%,transparent)]"
            style={{ scrollbarWidth: "none" }}
          >
            {parsed.synced ? (
              <div className="space-y-1 py-[35%]">
                {parsed.lines.map((line, i) => (
                  <button
                    key={`${line.time}-${i}`}
                    ref={(el) => {
                      lineRefs.current[i] = el;
                    }}
                    onClick={() => line.time != null && seek(line.time)}
                    className={cn(
                      "block w-full px-2 py-1.5 text-center transition-all duration-300",
                      i === activeIdx
                        ? "scale-105 text-lg font-bold text-white"
                        : "text-[15px] font-medium text-white/40 hover:text-white/70"
                    )}
                  >
                    {line.text || "♪"}
                  </button>
                ))}
              </div>
            ) : (
              <div className="space-y-2 py-4 text-center">
                {parsed.lines.map((line, i) => (
                  <p key={i} className="text-[15px] leading-relaxed text-white/85">
                    {line.text}
                  </p>
                ))}
              </div>
            )}
          </div>

          {/* 가사 도구 */}
          <div className="flex shrink-0 items-center justify-center gap-2 pt-2">
            <button
              onClick={() => setEditOpen(true)}
              className="inline-flex items-center gap-1 rounded-full bg-white/10 px-3 py-1.5 text-[11px] font-medium text-white/75 ring-1 ring-white/15 transition-colors hover:bg-white/20 hover:text-white"
            >
              <Pencil className="h-3 w-3" /> 편집
            </button>
            {track.sunoId && (
              <button
                onClick={fetchFromSuno}
                disabled={fetching}
                className="inline-flex items-center gap-1 rounded-full bg-white/10 px-3 py-1.5 text-[11px] font-medium text-white/75 ring-1 ring-white/15 transition-colors hover:bg-white/20 hover:text-white disabled:opacity-50"
              >
                {fetching ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <CloudDownload className="h-3 w-3" />
                )}
                Suno 다시 가져오기
              </button>
            )}
          </div>
        </>
      )}

      <LyricsEditModal
        open={editOpen}
        track={track}
        initial={raw}
        onClose={() => setEditOpen(false)}
        onSaved={() => {
          setEditOpen(false);
          void load();
        }}
      />
    </div>
  );
}

/* ── 가사 붙여넣기/편집 모달 ── */
function LyricsEditModal({
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
  const addToast = useToastStore((s) => s.addToast);
  const [content, setContent] = useState(initial);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) setContent(initial);
  }, [open, initial]);

  async function save() {
    if (busy || !content.trim()) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/lyrics/${track.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      const data = (await res.json()) as { format?: string; error?: string };
      if (!res.ok) throw new Error(data.error || "저장에 실패했습니다");
      addToast({
        type: "success",
        message:
          data.format === "lrc"
            ? "싱크 가사(LRC)로 저장했습니다"
            : "가사를 저장했습니다 (타임스탬프 없음 — 정적 표시)",
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

  async function remove() {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/lyrics/${track.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      addToast({ type: "success", message: "가사를 삭제했습니다" });
      setContent("");
      onSaved();
    } catch {
      addToast({ type: "error", message: "삭제에 실패했습니다" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={() => !busy && onClose()}
      title={`가사 — ${track.title}`}
      footer={
        <div className="flex items-center justify-between gap-2">
          <div>
            {initial && (
              <button
                onClick={remove}
                disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2.5 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50"
              >
                <Trash2 className="h-4 w-4" /> 삭제
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              disabled={busy}
              className="rounded-xl border border-strong bg-surface-primary px-4 py-2.5 text-sm font-medium text-body transition-colors hover:bg-surface-secondary disabled:opacity-50"
            >
              취소
            </button>
            <button
              onClick={save}
              disabled={busy || !content.trim()}
              className="flex items-center gap-2 rounded-xl bg-bora-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-bora-700 disabled:opacity-50"
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              저장
            </button>
          </div>
        </div>
      }
    >
      <div className="space-y-3">
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          disabled={busy}
          rows={12}
          placeholder={"가사를 붙여넣으세요.\n\n[00:12.50] 형식의 타임스탬프가 있으면\n자동으로 싱크 가사(LRC)로 저장됩니다."}
          aria-label="가사 내용"
          className="w-full resize-y rounded-xl border border-strong bg-surface-primary px-4 py-3 text-sm leading-relaxed text-heading outline-none transition-colors placeholder:text-caption focus:border-bora-500 focus:ring-1 focus:ring-bora-500"
        />
        <p className="text-xs text-caption">
          파일은 곡 옆에 <code className="rounded bg-surface-secondary px-1">.lrc</code>/
          <code className="rounded bg-surface-secondary px-1">.txt</code> 로 저장되며, WAV
          원본은 수정하지 않아요.
        </p>
      </div>
    </Modal>
  );
}
