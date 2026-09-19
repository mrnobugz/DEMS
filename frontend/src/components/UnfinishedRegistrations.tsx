import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { ConfigStatus, ConfirmAction } from "@/components/config/ConfigUi";
import { EmptyState } from "@/components/EmptyState";
import { api, ApiError } from "@/lib/api";
import type { RegistrationDraft } from "@/lib/types";

const STEP_COUNT = 6;

function whenLabel(iso: string) {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return "";
  const sameDay = at.toDateString() === new Date().toDateString();
  return sameDay
    ? at.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : at.toLocaleDateString([], { day: "2-digit", month: "short" });
}

/** Front-desk list of registrations that were started but not finalized. */
export function UnfinishedRegistrations() {
  const [rows, setRows] = useState<RegistrationDraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setRows(await api<RegistrationDraft[]>("/api/v1/patients/registration-drafts?status=open"));
    } catch (err) {
      setRows([]);
      setError(err instanceof ApiError ? err.message : "Could not load unfinished registrations");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function cancel(row: RegistrationDraft) {
    setOk("");
    setError("");
    try {
      await api<RegistrationDraft>(`/api/v1/patients/registration-drafts/${row.id}/cancel`, {
        method: "POST",
        body: JSON.stringify({ reason: "Cancelled from the Today board" }),
      });
      setRows((prev) => prev.filter((item) => item.id !== row.id));
      setOk(`Cancelled the unfinished registration for ${row.display_name}.`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not cancel that registration");
    }
  }

  return (
    <section className="glass-panel rounded-2xl p-4">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h3 className="font-display text-lg font-bold text-brand-900">Unfinished registrations</h3>
          <p className="text-sm text-muted">
            Saved part-way through. Continue where reception stopped, or cancel it.
          </p>
        </div>
        <span className="text-xs font-semibold text-muted">{rows.length} waiting</span>
      </div>
      <ConfigStatus loading={loading} error={error} ok={ok} />
      {!loading && !error && rows.length === 0 ? (
        <EmptyState
          title="Nothing unfinished"
          hint="Use Save & finish later in registration when a patient steps away."
        />
      ) : (
        <ul className="divide-y divide-brand-100">
          {rows.map((row) => (
            <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
              <div className="min-w-0">
                <div className="font-semibold text-ink">{row.display_name}</div>
                <div className="text-xs text-muted">
                  Step {Math.min(row.step + 1, STEP_COUNT)} of {STEP_COUNT}
                  {row.summary ? ` · ${row.summary}` : ""}
                </div>
                <div className="text-xs text-muted">
                  {row.created_by_name ? `Started by ${row.created_by_name} · ` : ""}
                  last saved {whenLabel(row.updated_at)}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Link
                  className="btn-primary inline-flex items-center gap-2 text-sm"
                  to={`/front-desk/register?draft=${row.id}`}
                >
                  Continue <ArrowRight size={16} aria-hidden />
                </Link>
                <ConfirmAction
                  label="Cancel"
                  confirmLabel="Yes, cancel it"
                  onConfirm={() => cancel(row)}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
