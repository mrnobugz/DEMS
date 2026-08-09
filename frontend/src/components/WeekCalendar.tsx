import { useMemo, useState } from "react";
import {
  addDays,
  differenceInMinutes,
  format,
  isSameDay,
  parseISO,
  setHours,
  setMinutes,
  startOfDay,
} from "date-fns";
import type { Appointment } from "@/lib/types";

const DAY_START_HOUR = 8;
const DAY_END_HOUR = 18;
const SLOT_MINUTES = 60;
const ROW_PX = 48;

type Props = {
  weekStart: Date;
  appointments: Appointment[];
  onReschedule: (id: string, startsAt: Date) => Promise<void>;
  onSelectDay?: (day: Date) => void;
};

export function WeekCalendar({ weekStart, appointments, onReschedule, onSelectDay }: Props) {
  const [dragOver, setDragOver] = useState<string | null>(null);
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);
  const slots = ((DAY_END_HOUR - DAY_START_HOUR) * 60) / SLOT_MINUTES;
  const height = slots * ROW_PX;

  const byDay = useMemo(() => {
    return days.map((day) =>
      appointments.filter((a) => {
        if (a.waitlist || a.status === "cancelled" || a.status === "no_show") return false;
        return isSameDay(parseISO(a.starts_at), day);
      }),
    );
  }, [appointments, days]);

  return (
    <div className="overflow-x-auto">
      <div
        className="grid min-w-[800px]"
        style={{ gridTemplateColumns: `56px repeat(7, minmax(110px, 1fr))` }}
      >
        <div />
        {days.map((d) => (
          <button
            key={d.toISOString()}
            type="button"
            className="border-b border-brand-100 px-1 py-2 text-center text-xs font-semibold text-brand-800 hover:bg-brand-50"
            onClick={() => onSelectDay?.(startOfDay(d))}
          >
            {format(d, "EEE d")}
          </button>
        ))}

        <div className="relative" style={{ height }}>
          {Array.from({ length: slots }).map((_, i) => (
            <div
              key={i}
              className="absolute left-0 right-0 border-t border-brand-50 px-1 text-[10px] text-muted"
              style={{ top: i * ROW_PX, height: ROW_PX }}
            >
              {String(DAY_START_HOUR + i).padStart(2, "0")}:00
            </div>
          ))}
        </div>

        {days.map((day, dayIdx) => (
          <div
            key={day.toISOString()}
            className="relative border-l border-brand-50 bg-white/40"
            style={{ height }}
            onDragOver={(e) => {
              e.preventDefault();
              const rect = e.currentTarget.getBoundingClientRect();
              const y = e.clientY - rect.top;
              const idx = Math.max(0, Math.min(slots - 1, Math.floor(y / ROW_PX)));
              setDragOver(`${dayIdx}:${idx}`);
            }}
            onDrop={(e) => {
              e.preventDefault();
              const id = e.dataTransfer.getData("text/appointment-id");
              const rect = e.currentTarget.getBoundingClientRect();
              const y = e.clientY - rect.top;
              const idx = Math.max(0, Math.min(slots - 1, Math.floor(y / ROW_PX)));
              if (!id) return;
              const starts = setMinutes(setHours(day, DAY_START_HOUR + idx), 0);
              void onReschedule(id, starts);
              setDragOver(null);
            }}
          >
            {Array.from({ length: slots }).map((_, i) => (
              <div
                key={i}
                className={`absolute inset-x-0 border-t border-brand-50/70 ${
                  dragOver === `${dayIdx}:${i}` ? "bg-brand-100/60" : ""
                }`}
                style={{ top: i * ROW_PX, height: ROW_PX }}
              />
            ))}
            {byDay[dayIdx].map((a) => {
              const start = parseISO(a.starts_at);
              const end = parseISO(a.ends_at);
              const topMins = start.getHours() * 60 + start.getMinutes() - DAY_START_HOUR * 60;
              const top = (topMins / SLOT_MINUTES) * ROW_PX;
              const dur = Math.max(SLOT_MINUTES, differenceInMinutes(end, start));
              const h = (dur / SLOT_MINUTES) * ROW_PX - 4;
              return (
                <button
                  key={a.id}
                  type="button"
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData("text/appointment-id", a.id);
                    e.dataTransfer.effectAllowed = "move";
                  }}
                  className="absolute left-0.5 right-0.5 z-[1] overflow-hidden rounded-md px-1.5 py-1 text-left text-[10px] text-white"
                  style={{
                    top: Math.max(0, top + 2),
                    height: Math.max(28, h),
                    background: a.color || "#0B5FFF",
                  }}
                >
                  <div className="truncate font-semibold">
                    {a.patient ? a.patient.first_name : "Pt"}
                  </div>
                  <div className="truncate opacity-90">{format(start, "HH:mm")}</div>
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
