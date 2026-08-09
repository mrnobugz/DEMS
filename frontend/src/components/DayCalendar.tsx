import { useMemo, useState } from "react";
import { differenceInMinutes, format, parseISO, setHours, setMinutes } from "date-fns";
import type { Appointment } from "@/lib/types";

type Dentist = { id: string; full_name: string };

const DAY_START_HOUR = 8;
const DAY_END_HOUR = 18;
const SLOT_MINUTES = 30;
const ROW_PX = 44;

type Props = {
  day: Date;
  dentists: Dentist[];
  appointments: Appointment[];
  onReschedule: (id: string, startsAt: Date, dentistId: string) => Promise<void>;
  onSelect?: (appt: Appointment) => void;
};

function slotCount() {
  return ((DAY_END_HOUR - DAY_START_HOUR) * 60) / SLOT_MINUTES;
}

function minutesFromDayStart(d: Date) {
  return d.getHours() * 60 + d.getMinutes() - DAY_START_HOUR * 60;
}

export function DayCalendar({ day, dentists, appointments, onReschedule, onSelect }: Props) {
  const [dragOver, setDragOver] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const slots = slotCount();
  const height = slots * ROW_PX;

  const byDentist = useMemo(() => {
    const map = new Map<string, Appointment[]>();
    for (const d of dentists) map.set(d.id, []);
    for (const a of appointments) {
      if (a.waitlist) continue;
      if (a.status === "cancelled" || a.status === "no_show") continue;
      const list = map.get(a.dentist_id) ?? [];
      list.push(a);
      map.set(a.dentist_id, list);
    }
    return map;
  }, [appointments, dentists]);

  async function dropOn(dentistId: string, slotIndex: number, appointmentId: string) {
    const starts = setMinutes(
      setHours(day, DAY_START_HOUR),
      slotIndex * SLOT_MINUTES,
    );
    setBusy(true);
    try {
      await onReschedule(appointmentId, starts, dentistId);
    } finally {
      setBusy(false);
      setDragOver(null);
    }
  }

  return (
    <div className={`overflow-x-auto ${busy ? "opacity-70" : ""}`}>
      <div
        className="grid min-w-[720px]"
        style={{ gridTemplateColumns: `64px repeat(${Math.max(dentists.length, 1)}, minmax(160px, 1fr))` }}
      >
        <div className="sticky left-0 z-10 bg-surface/90" />
        {dentists.map((d) => (
          <div
            key={d.id}
            className="border-b border-brand-100 px-2 py-2 text-center text-xs font-semibold text-brand-800"
          >
            {d.full_name}
          </div>
        ))}

        <div className="relative sticky left-0 z-10 bg-surface/90" style={{ height }}>
          {Array.from({ length: slots }).map((_, i) => {
            const mins = DAY_START_HOUR * 60 + i * SLOT_MINUTES;
            const label =
              i % 2 === 0
                ? `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`
                : "";
            return (
              <div
                key={i}
                className="absolute left-0 right-0 border-t border-brand-50 px-1 text-[10px] text-muted"
                style={{ top: i * ROW_PX, height: ROW_PX }}
              >
                {label}
              </div>
            );
          })}
        </div>

        {dentists.map((d) => (
          <div
            key={d.id}
            className="relative border-l border-brand-50 bg-white/50"
            style={{ height }}
            onDragOver={(e) => {
              e.preventDefault();
              const rect = e.currentTarget.getBoundingClientRect();
              const y = e.clientY - rect.top;
              const idx = Math.max(0, Math.min(slots - 1, Math.floor(y / ROW_PX)));
              setDragOver(`${d.id}:${idx}`);
            }}
            onDragLeave={() => setDragOver(null)}
            onDrop={(e) => {
              e.preventDefault();
              const id = e.dataTransfer.getData("text/appointment-id");
              const rect = e.currentTarget.getBoundingClientRect();
              const y = e.clientY - rect.top;
              const idx = Math.max(0, Math.min(slots - 1, Math.floor(y / ROW_PX)));
              if (id) void dropOn(d.id, idx, id);
            }}
          >
            {Array.from({ length: slots }).map((_, i) => (
              <div
                key={i}
                className={`absolute left-0 right-0 border-t border-brand-50/80 ${
                  dragOver === `${d.id}:${i}` ? "bg-brand-100/70" : ""
                }`}
                style={{ top: i * ROW_PX, height: ROW_PX }}
              />
            ))}
            {(byDentist.get(d.id) || []).map((a) => {
              const start = parseISO(a.starts_at);
              const end = parseISO(a.ends_at);
              const top = (minutesFromDayStart(start) / SLOT_MINUTES) * ROW_PX;
              const dur = Math.max(SLOT_MINUTES, differenceInMinutes(end, start));
              const h = (dur / SLOT_MINUTES) * ROW_PX - 4;
              if (top + h < 0 || top > height) return null;
              return (
                <button
                  key={a.id}
                  type="button"
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData("text/appointment-id", a.id);
                    e.dataTransfer.effectAllowed = "move";
                  }}
                  onClick={() => onSelect?.(a)}
                  className="absolute left-1 right-1 z-[1] overflow-hidden rounded-lg px-2 py-1 text-left text-xs text-white shadow-sm transition hover:brightness-110"
                  style={{
                    top: Math.max(0, top + 2),
                    height: Math.max(ROW_PX - 6, h),
                    background: a.color || "#0B5FFF",
                  }}
                  title="Drag to reschedule"
                >
                  <div className="truncate font-semibold">
                    {a.patient
                      ? `${a.patient.first_name} ${a.patient.last_name}`
                      : "Patient"}
                  </div>
                  <div className="truncate opacity-90">
                    {format(start, "HH:mm")}–{format(end, "HH:mm")}
                    {a.chair_number ? ` · Ch ${a.chair_number}` : ""}
                  </div>
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
