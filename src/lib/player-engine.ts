/* ───────────────────────────────────────────
   PlayerEngine — HTMLAudioElement + Web Audio 그래프 싱글톤
   (의존성 없음 — 이벤트는 listeners 주입으로 스토어에 전달,
    순환 import 방지. AudioEngine 컴포넌트가 배선한다)
   ─────────────────────────────────────────── */

export interface EngineListeners {
  onTime?: (t: number) => void;
  onDuration?: (d: number) => void;
  onEnded?: () => void;
  onPlayState?: (playing: boolean) => void;
  onError?: () => void;
}

class PlayerEngine {
  private audio: HTMLAudioElement | null = null;
  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private currentSrc = "";
  /** 다음 메타데이터 로드 직후 적용할 시킹 위치 (곡 이동 후 위치 복원용) */
  private pendingSeek: number | null = null;
  listeners: EngineListeners = {};

  private ensureAudio(): HTMLAudioElement | null {
    if (typeof window === "undefined") return null;
    if (this.audio) return this.audio;
    const a = new Audio();
    a.preload = "metadata";
    a.addEventListener("timeupdate", () => this.listeners.onTime?.(a.currentTime));
    a.addEventListener("loadedmetadata", () => {
      this.listeners.onDuration?.(a.duration || 0);
      if (this.pendingSeek != null) {
        try {
          a.currentTime = this.pendingSeek;
        } catch {
          // 무시 — 처음부터 재생
        }
        this.pendingSeek = null;
      }
    });
    a.addEventListener("durationchange", () => this.listeners.onDuration?.(a.duration || 0));
    a.addEventListener("ended", () => this.listeners.onEnded?.());
    a.addEventListener("play", () => this.listeners.onPlayState?.(true));
    a.addEventListener("pause", () => this.listeners.onPlayState?.(false));
    a.addEventListener("error", () => {
      // src 교체로 인한 빈 에러는 무시
      if (a.src && this.currentSrc) this.listeners.onError?.();
    });
    this.audio = a;
    return a;
  }

  /** 시각화용 Web Audio 그래프 — 첫 재생(사용자 제스처) 시점에 1회 구성 */
  private ensureGraph() {
    if (this.ctx || typeof window === "undefined" || !this.audio) return;
    const AC =
      window.AudioContext ??
      (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    try {
      const ctx = new AC();
      const source = ctx.createMediaElementSource(this.audio);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.82;
      source.connect(analyser);
      analyser.connect(ctx.destination);
      this.ctx = ctx;
      this.analyser = analyser;
    } catch {
      // Web Audio 실패 시에도 기본 <audio> 출력은 유지
    }
  }

  load(src: string, autoplay: boolean, resumeAt?: number) {
    const a = this.ensureAudio();
    if (!a) return;
    if (this.currentSrc !== src) {
      this.currentSrc = src;
      this.pendingSeek = resumeAt ?? null;
      a.src = src;
      a.load();
    }
    if (autoplay) void this.play();
  }

  async play() {
    const a = this.ensureAudio();
    if (!a || !this.currentSrc) return;
    this.ensureGraph();
    if (this.ctx?.state === "suspended") void this.ctx.resume();
    try {
      await a.play();
    } catch {
      // 자동재생 차단/소스 교체 중단(AbortError) — pause 이벤트가 상태를 동기화
    }
  }

  pause() {
    this.audio?.pause();
  }

  seek(t: number) {
    const a = this.audio;
    if (!a) return;
    try {
      a.currentTime = t;
    } catch {
      // 메타데이터 로드 전 시킹 시도 — 무시
    }
  }

  setVolume(v: number) {
    const a = this.ensureAudio();
    if (a) a.volume = Math.min(1, Math.max(0, v));
  }

  setMuted(muted: boolean) {
    const a = this.ensureAudio();
    if (a) a.muted = muted;
  }

  getAnalyser(): AnalyserNode | null {
    return this.analyser;
  }
}

export const playerEngine = new PlayerEngine();
