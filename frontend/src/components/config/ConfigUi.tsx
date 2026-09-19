import { KeyboardEvent, ReactNode, useState } from "react";

export function onTabListKeyDown<T extends string>(
  e: KeyboardEvent,
  ids: readonly T[],
  current: T,
  setCurrent: (id: T) => void,
) {
  const i = ids.indexOf(current);
  if (i < 0) return;
  if (e.key === "ArrowRight" || e.key === "ArrowDown") {
    e.preventDefault();
    setCurrent(ids[(i + 1) % ids.length]!);
  } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
    e.preventDefault();
    setCurrent(ids[(i - 1 + ids.length) % ids.length]!);
  } else if (e.key === "Home") {
    e.preventDefault();
    setCurrent(ids[0]!);
  } else if (e.key === "End") {
    e.preventDefault();
    setCurrent(ids[ids.length - 1]!);
  }
}

export function ConfigStatus({
  loading,
  error,
  ok,
}: {
  loading?: boolean;
  error?: string;
  ok?: string;
}) {
  if (!loading && !error && !ok) return null;
  return (
    <div className="config-status" role="status" aria-live="polite">
      {loading && <p className="text-sm text-muted">Loading…</p>}
      {error && <p className="text-sm font-semibold text-red-700">{error}</p>}
      {ok && !error && <p className="text-sm font-semibold text-brand-800">{ok}</p>}
    </div>
  );
}

export function ConfigField({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="config-field text-sm">
      <span className="label">{label}</span>
      {children}
      {hint && <span className="config-field__hint">{hint}</span>}
    </label>
  );
}

export function ConfirmAction({
  label,
  confirmLabel = "Confirm",
  onConfirm,
}: {
  label: string;
  confirmLabel?: string;
  onConfirm: () => void | Promise<void>;
}) {
  const [armed, setArmed] = useState(false);
  if (!armed) {
    return (
      <button type="button" className="btn-ghost text-sm" onClick={() => setArmed(true)}>
        {label}
      </button>
    );
  }
  return (
    <span className="config-confirm">
      <button
        type="button"
        className="btn-primary text-sm"
        onClick={() => {
          setArmed(false);
          void onConfirm();
        }}
      >
        {confirmLabel}
      </button>
      <button type="button" className="btn-ghost text-sm" onClick={() => setArmed(false)}>
        Cancel
      </button>
    </span>
  );
}
