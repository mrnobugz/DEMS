import { useEffect, useState } from "react";
import { format, parseISO } from "date-fns";
import { api } from "@/lib/api";

type Event = {
  kind: string;
  id: string;
  occurred_at?: string | null;
  summary: string;
  status?: string | null;
  details?: Record<string, unknown>;
};

type Props = {
  patientId: string;
  toothNumber: string | null;
};

const KIND_LABEL: Record<string, string> = {
  chart: "Chart",
  restoration: "Restoration",
  endo: "Endodontics",
};

export function ToothHistoryPanel({ patientId, toothNumber }: Props) {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!toothNumber) {
      setEvents([]);
      return;
    }
    setLoading(true);
    api<{ tooth_number: string; events: Event[] }>(
      `/api/v1/clinical/patients/${patientId}/teeth/${encodeURIComponent(toothNumber)}/history`,
    )
      .then((data) => setEvents(data.events))
      .catch(() => setEvents([]))
      .finally(() => setLoading(false));
  }, [patientId, toothNumber]);

  if (!toothNumber) {
    return (
      <div className="glass-panel rounded-3xl p-5">
        <h3 className="font-display text-lg font-bold">Tooth timeline</h3>
        <p className="mt-2 text-sm text-muted">Select a tooth on the odontogram to see its history.</p>
      </div>
    );
  }

  return (
    <div className="glass-panel rounded-3xl p-5">
      <h3 className="font-display text-lg font-bold">Tooth {toothNumber} timeline</h3>
      <p className="text-sm text-muted">Chart · restorations · endo for this tooth</p>
      {loading ? (
        <p className="mt-3 text-sm text-muted">Loading…</p>
      ) : events.length === 0 ? (
        <p className="mt-3 text-sm text-muted">No recorded events for this tooth.</p>
      ) : (
        <ol className="mt-4 space-y-3 border-l-2 border-brand-100 pl-4">
          {events.map((ev) => (
            <li key={`${ev.kind}-${ev.id}`} className="relative">
              <span className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full bg-brand-500" />
              <div className="text-[10px] font-semibold uppercase tracking-wide text-brand-600">
                {KIND_LABEL[ev.kind] || ev.kind}
                {ev.status ? ` · ${ev.status}` : ""}
              </div>
              <div className="text-sm font-semibold text-brand-900">{ev.summary}</div>
              <div className="text-xs text-muted">
                {ev.occurred_at
                  ? format(parseISO(ev.occurred_at), "MMM d, yyyy HH:mm")
                  : "—"}
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
