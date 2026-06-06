"use client";

import { cn } from "@/lib/utils";

/** 모든 폼 컨트롤 공통 클래스 (BORA 입력 스타일과 동일) */
export const fieldInputClass =
  "w-full rounded-xl border border-strong px-4 py-3 text-sm text-heading bg-surface-primary placeholder:text-caption focus:border-bora-500 focus:ring-1 focus:ring-bora-500 outline-none transition-colors disabled:opacity-50 disabled:bg-surface-secondary";

export function Field({
  label,
  hint,
  required,
  children,
  className,
}: {
  label?: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      {label && (
        <label className="block text-sm font-medium text-heading mb-1">
          {label}
          {required && <span className="text-red-500 ml-0.5">*</span>}
        </label>
      )}
      {children}
      {hint && <p className="mt-1 text-xs text-caption">{hint}</p>}
    </div>
  );
}

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const { className, ...rest } = props;
  return <input {...rest} className={cn(fieldInputClass, className)} />;
}

export function TextArea(
  props: React.TextareaHTMLAttributes<HTMLTextAreaElement>
) {
  const { className, rows = 3, ...rest } = props;
  return (
    <textarea {...rest} rows={rows} className={cn(fieldInputClass, "resize-none", className)} />
  );
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  const { className, children, ...rest } = props;
  return (
    <select {...rest} className={cn(fieldInputClass, "cursor-pointer", className)}>
      {children}
    </select>
  );
}

/** 토글 칩 그룹 (단일 선택) — 방문유형/복용시점/끼니 선택 등에 사용 */
export function ChipSelect<T extends string>({
  options,
  value,
  onChange,
  className,
}: {
  options: readonly T[];
  value: T;
  onChange: (v: T) => void;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      {options.map((opt) => (
        <button
          key={opt}
          type="button"
          onClick={() => onChange(opt)}
          aria-pressed={value === opt}
          className={cn(
            "px-3.5 py-2 rounded-xl text-sm font-medium transition-colors border outline-none focus-visible:ring-1 focus-visible:ring-bora-400",
            value === opt
              ? "bg-bora-600 text-white border-bora-600"
              : "bg-surface-primary text-body border-strong hover:bg-surface-secondary"
          )}
        >
          {opt}
        </button>
      ))}
    </div>
  );
}
