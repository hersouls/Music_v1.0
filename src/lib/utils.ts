import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/* ───────────────────────────────────────────
   날짜 / 시간 유틸
   ─────────────────────────────────────────── */

/** 오늘 날짜 "YYYY-MM-DD" (로컬 기준) */
export function todayISO(): string {
  return toISODate(new Date());
}

/** Date → "YYYY-MM-DD" (로컬 기준, UTC 변환 없음) */
export function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** "YYYY-MM-DD" → Date (로컬 정오 기준, TZ 오프셋 안전) */
export function fromISODate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1, 12, 0, 0, 0);
}

/** 현재 시각 "HH:mm" */
export function nowTime(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(
    d.getMinutes()
  ).padStart(2, "0")}`;
}

const WEEKDAYS_KO = ["일", "월", "화", "수", "목", "금", "토"];

/** "2026-06-02" → "2026.06.02 (월)" */
export function formatDateKo(iso: string, withWeekday = true): string {
  if (!iso) return "-";
  const d = fromISODate(iso);
  const base = `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(
    2,
    "0"
  )}.${String(d.getDate()).padStart(2, "0")}`;
  return withWeekday ? `${base} (${WEEKDAYS_KO[d.getDay()]})` : base;
}

/** "2026-06-02" → "6월 2일 (월)" */
export function formatMonthDayKo(iso: string): string {
  if (!iso) return "-";
  const d = fromISODate(iso);
  return `${d.getMonth() + 1}월 ${d.getDate()}일 (${WEEKDAYS_KO[d.getDay()]})`;
}

/** 요일 한글 1글자 */
export function weekdayKo(iso: string): string {
  return WEEKDAYS_KO[fromISODate(iso).getDay()];
}

/** 상대 날짜 라벨: 오늘 / 내일 / 어제 / D-n / +n일 */
export function relativeDayLabel(iso: string): string {
  if (!iso) return "-";
  const diff = daysBetween(todayISO(), iso);
  if (diff === 0) return "오늘";
  if (diff === 1) return "내일";
  if (diff === -1) return "어제";
  if (diff > 0) return `D-${diff}`;
  return `${Math.abs(diff)}일 전`;
}

/** a → b 일수 차 (b - a) */
export function daysBetween(a: string, b: string): number {
  const ms = fromISODate(b).getTime() - fromISODate(a).getTime();
  return Math.round(ms / 86400000);
}

/** iso 날짜에 days 더한 "YYYY-MM-DD" */
export function addDaysISO(iso: string, days: number): string {
  const d = fromISODate(iso);
  d.setDate(d.getDate() + days);
  return toISODate(d);
}

/** 해당 주(월요일 시작)의 7일 ISO 배열 반환 */
export function weekDates(anchorISO: string): string[] {
  const d = fromISODate(anchorISO);
  const dow = (d.getDay() + 6) % 7; // 월=0 ... 일=6
  const monday = addDaysISO(anchorISO, -dow);
  return Array.from({ length: 7 }, (_, i) => addDaysISO(monday, i));
}

/* ───────────────────────────────────────────
   숫자 / 포맷 유틸
   ─────────────────────────────────────────── */

/** 1234567 → "1,234,567" */
export function formatNumber(n: number): string {
  return new Intl.NumberFormat("ko-KR").format(Math.round(n || 0));
}

/** 12000 → "12,000원" */
export function formatKRW(n: number): string {
  return `${formatNumber(n)}원`;
}

/** 만 나이 계산 */
export function calcAge(birthISO: string): number {
  if (!birthISO) return 0;
  const b = fromISODate(birthISO);
  const now = new Date();
  let age = now.getFullYear() - b.getFullYear();
  const m = now.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < b.getDate())) age--;
  return Math.max(0, age);
}

/** BMI */
export function calcBMI(heightCm: number, weightKg: number): number {
  if (!heightCm || !weightKg) return 0;
  const m = heightCm / 100;
  return Math.round((weightKg / (m * m)) * 10) / 10;
}

/** BMI 분류 라벨 */
export function bmiCategory(bmi: number): string {
  if (bmi <= 0) return "-";
  if (bmi < 18.5) return "저체중";
  if (bmi < 23) return "정상";
  if (bmi < 25) return "과체중";
  if (bmi < 30) return "비만";
  return "고도비만";
}

/** 두 시간 "HH:mm" 비교 (a<b → -1) */
export function compareTime(a: string, b: string): number {
  return a.localeCompare(b);
}

/** 클라이언트 전용 안전 UUID */
export function uid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `id-${Math.random().toString(36).slice(2)}-${Date.now()}`;
}
