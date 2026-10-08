import type { ComponentProps, ReactNode, Ref } from "react";
import { cn } from "@/lib/utils";

type FieldProps = {
  label: string;
  hint?: string;
  error?: string;
  ref?: Ref<HTMLInputElement>;
};

export function Input({ label, hint, error, className, id, ref, ...props }: ComponentProps<"input"> & FieldProps) {
  const inputId = id || props.name;
  return (
    <label className="block text-sm" htmlFor={inputId}>
      <span className="label">{label}</span>
      <input
        id={inputId}
        ref={ref}
        className={cn("input", error && "border-[var(--err-fg)]", className)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined}
        {...props}
      />
      {hint && !error && (
        <span id={`${inputId}-hint`} className="mt-1 block text-xs text-muted">
          {hint}
        </span>
      )}
      {error && (
        <span id={`${inputId}-error`} className="mt-1 block text-xs text-danger" role="alert">
          {error}
        </span>
      )}
    </label>
  );
}

export function Textarea({
  label,
  hint,
  error,
  className,
  id,
  ref,
  ...props
}: ComponentProps<"textarea"> & Omit<FieldProps, "ref"> & { ref?: Ref<HTMLTextAreaElement> }) {
  const inputId = id || props.name;
  return (
    <label className="block text-sm" htmlFor={inputId}>
      <span className="label">{label}</span>
      <textarea
        id={inputId}
        ref={ref}
        className={cn("input", error && "border-[var(--err-fg)]", className)}
        aria-invalid={error ? true : undefined}
        {...props}
      />
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
      {error && (
        <span className="mt-1 block text-xs text-danger" role="alert">
          {error}
        </span>
      )}
    </label>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block text-sm">
      <span className="label">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  );
}
