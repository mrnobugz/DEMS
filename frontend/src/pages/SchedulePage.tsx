import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  addDays,
  differenceInMinutes,
  format,
  parseISO,
  startOfDay,
  startOfWeek,
} from "date-fns";
import { api, ApiError } from "@/lib/api";
import { DayCalendar } from "@/components/DayCalendar";
import { WeekCalendar } from "@/components/WeekCalendar";
import type { Appointment, AppointmentType, Page, Patient } from "@/lib/types";

type Dentist = { id: string; full_name: string; role: string; specialty?: string | null };
type ViewMode = "day" | "week";

export function SchedulePage() {
  const [day, setDay] = useState(() => startOfDay(new Date()));
  const [view, setView] = useState<ViewMode>("day");
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [waitlist, setWaitlist] = useState<Appointment[]>([]);
  const [types, setTypes] = useState<AppointmentType[]>([]);
  const [dentists, setDentists] = useState<Dentist[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [slots, setSlots] = useState<Array<{ starts_at: string; ends_at: string; score: number; reason: string }>>([]);
  const [selected, setSelected] = useState<Appointment | null>(null);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    patient_id: "",
    dentist_id: "",
    appointment_type_id: "",
    chair_number: "1",
    starts_at: "",
    duration: "30",
    reason: "",
    waitlist: false,
  });

  const weekStart = useMemo(() => startOfWeek(day, { weekStartsOn: 1 }), [day]);
  const range = useMemo(() => {
    if (view === "week") {
      return { start: weekStart.toISOString(), end: addDays(weekStart, 7).toISOString() };
    }
    return { start: day.toISOString(), end: addDays(day, 1).toISOString() };
  }, [day, view, weekStart]);

  async function load() {
    const [a, t, d, p, w] = await Promise.all([
      api<Appointment[]>(
        `/api/v1/appointments?start=${encodeURIComponent(range.start)}&end=${encodeURIComponent(range.end)}`,
      ),
      api<AppointmentType[]>("/api/v1/appointments/types"),
      api<Dentist[]>("/api/v1/staff/dentists"),
      api<Page<Patient>>("/api/v1/patients?limit=100"),
      api<Appointment[]>(
        `/api/v1/appointments?waitlist=true&start=${encodeURIComponent(range.start)}&end=${encodeURIComponent(addDays(parseISO(range.end), 14).toISOString())}`,
      ),
    ]);
    setAppointments(a.filter((x) => !x.waitlist));
    setWaitlist(w.filter((x) => x.waitlist));
    setTypes(t);
    setDentists(d);
    setPatients(p.items);
    if (!form.dentist_id && d[0]) setForm((f) => ({ ...f, dentist_id: d[0].id }));
    if (!form.patient_id && p.items[0]) setForm((f) => ({ ...f, patient_id: p.items[0].id }));
    if (!form.appointment_type_id && t[0]) {
      setForm((f) => ({
        ...f,
        appointment_type_id: t[0].id,
        duration: String(t[0].duration_minutes),
      }));
    }
  }

  useEffect(() => {
    void load();
  }, [range.start, range.end]);

  async function suggestSlots() {
    if (!form.dentist_id) return;
    const data = await api<{ slots: typeof slots }>("/api/v1/ai/smart-slots", {
      method: "POST",
      body: JSON.stringify({
        dentist_id: form.dentist_id,
        duration_minutes: Number(form.duration),
        preferred_date: format(day, "yyyy-MM-dd"),
      }),
    });
    setSlots(data.slots);
  }

  async function createAppt(e: FormEvent) {
    e.preventDefault();
    setError("");
    try {
      const starts = new Date(form.starts_at);
      const ends = new Date(starts.getTime() + Number(form.duration) * 60_000);
      await api("/api/v1/appointments", {
        method: "POST",
        body: JSON.stringify({
          patient_id: form.patient_id,
          dentist_id: form.dentist_id,
          appointment_type_id: form.appointment_type_id || null,
          chair_number: Number(form.chair_number),
          starts_at: starts.toISOString(),
          ends_at: ends.toISOString(),
          reason: form.reason || null,
          waitlist: form.waitlist,
        }),
      });
      await load();
      setSlots([]);
      setForm((f) => ({ ...f, waitlist: false, reason: "" }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Booking failed");
    }
  }

  async function reschedule(id: string, startsAt: Date, dentistId?: string) {
    setError("");
    const appt = appointments.find((a) => a.id === id) || waitlist.find((a) => a.id === id);
    if (!appt) return;
    const duration = Math.max(
      15,
      differenceInMinutes(parseISO(appt.ends_at), parseISO(appt.starts_at)),
    );
    const endsAt = new Date(startsAt.getTime() + duration * 60_000);
    try {
      await api(`/api/v1/appointments/${id}`, {
        method: "PATCH",
        body: JSON.stringify({
          starts_at: startsAt.toISOString(),
          ends_at: endsAt.toISOString(),
          ...(dentistId ? { dentist_id: dentistId } : {}),
          waitlist: false,
        }),
      });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Reschedule conflict");
    }
  }

  async function moveStatus(id: string, status: string) {
    await api(`/api/v1/appointments/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    });
    await load();
    setSelected(null);
  }

  async function offerFromWaitlist(id: string) {
    if (!form.starts_at) {
      setError("Pick a start time in the booking form, then offer the waitlist slot");
      return;
    }
    const starts = new Date(form.starts_at);
    await reschedule(id, starts, form.dentist_id || undefined);
  }

  return (
    <div className="space-y-5 animate-rise">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl font-bold text-brand-900">Schedule</h2>
          <p className="text-sm text-muted">
            Multi-dentist day/week grid · drag to reschedule · waitlist
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-xl bg-white p-1 shadow-sm">
            <button
              type="button"
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${view === "day" ? "bg-brand-500 text-white" : "text-muted"}`}
              onClick={() => setView("day")}
            >
              Day
            </button>
            <button
              type="button"
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${view === "week" ? "bg-brand-500 text-white" : "text-muted"}`}
              onClick={() => setView("week")}
            >
              Week
            </button>
          </div>
          <button
            className="btn-ghost"
            onClick={() => setDay(addDays(day, view === "week" ? -7 : -1))}
          >
            Prev
          </button>
          <div className="rounded-xl bg-white px-3 py-2 text-sm font-semibold text-brand-800">
            {view === "week"
              ? `${format(weekStart, "MMM d")} – ${format(addDays(weekStart, 6), "MMM d")}`
              : format(day, "EEE, MMM d")}
          </div>
          <button
            className="btn-ghost"
            onClick={() => setDay(addDays(day, view === "week" ? 7 : 1))}
          >
            Next
          </button>
          <button className="btn-ghost" onClick={() => setDay(startOfDay(new Date()))}>
            Today
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-[1fr_320px]">
        <div className="glass-panel rounded-3xl p-4">
          {view === "day" ? (
            dentists.length === 0 ? (
              <p className="text-sm text-muted">No dentists available.</p>
            ) : (
              <DayCalendar
                day={day}
                dentists={dentists}
                appointments={appointments}
                onReschedule={(id, starts, dentistId) => reschedule(id, starts, dentistId)}
                onSelect={setSelected}
              />
            )
          ) : (
            <WeekCalendar
              weekStart={weekStart}
              appointments={appointments}
              onReschedule={(id, starts) => reschedule(id, starts)}
              onSelectDay={(d) => {
                setDay(d);
                setView("day");
              }}
            />
          )}
        </div>

        <div className="space-y-4">
          <form className="glass-panel space-y-3 rounded-3xl p-5" onSubmit={createAppt}>
            <h3 className="font-display text-lg font-bold">Book appointment</h3>
            <div>
              <label className="label">Patient</label>
              <select
                className="input"
                value={form.patient_id}
                onChange={(e) => setForm({ ...form, patient_id: e.target.value })}
              >
                {patients.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.first_name} {p.last_name} ({p.patient_code})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Dentist</label>
              <select
                className="input"
                value={form.dentist_id}
                onChange={(e) => setForm({ ...form, dentist_id: e.target.value })}
              >
                {dentists.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.full_name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Type</label>
              <select
                className="input"
                value={form.appointment_type_id}
                onChange={(e) => {
                  const t = types.find((x) => x.id === e.target.value);
                  setForm({
                    ...form,
                    appointment_type_id: e.target.value,
                    duration: String(t?.duration_minutes ?? form.duration),
                  });
                }}
              >
                {types.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.duration_minutes}m)
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Start</label>
                <input
                  className="input"
                  type="datetime-local"
                  required
                  value={form.starts_at}
                  onChange={(e) => setForm({ ...form, starts_at: e.target.value })}
                />
              </div>
              <div>
                <label className="label">Chair</label>
                <input
                  className="input"
                  type="number"
                  min={1}
                  max={20}
                  value={form.chair_number}
                  onChange={(e) => setForm({ ...form, chair_number: e.target.value })}
                />
              </div>
            </div>
            <div>
              <label className="label">Reason</label>
              <input
                className="input"
                value={form.reason}
                onChange={(e) => setForm({ ...form, reason: e.target.value })}
              />
            </div>
            <label className="flex items-center gap-2 text-sm text-brand-800">
              <input
                type="checkbox"
                checked={form.waitlist}
                onChange={(e) => setForm({ ...form, waitlist: e.target.checked })}
              />
              Add to waitlist (no chair conflict)
            </label>
            <div className="flex flex-wrap gap-2">
              <button className="btn-primary" type="submit">
                {form.waitlist ? "Join waitlist" : "Book"}
              </button>
              <button className="btn-ghost" type="button" onClick={() => void suggestSlots()}>
                Suggest smart slots
              </button>
            </div>
          </form>

          {selected && (
            <div className="glass-panel space-y-2 rounded-3xl p-5">
              <h3 className="font-display text-lg font-bold">Selected</h3>
              <p className="text-sm font-semibold">
                {selected.patient
                  ? `${selected.patient.first_name} ${selected.patient.last_name}`
                  : "Patient"}
              </p>
              <p className="text-xs text-muted">
                {format(parseISO(selected.starts_at), "HH:mm")}–
                {format(parseISO(selected.ends_at), "HH:mm")} · {selected.status}
              </p>
              <div className="flex flex-wrap gap-2">
                <button className="btn-ghost text-xs" onClick={() => void moveStatus(selected.id, "checked_in")}>
                  Check in
                </button>
                <button className="btn-ghost text-xs" onClick={() => void moveStatus(selected.id, "completed")}>
                  Complete
                </button>
                <button className="btn-ghost text-xs" onClick={() => void moveStatus(selected.id, "no_show")}>
                  No-show
                </button>
                <button className="btn-ghost text-xs" onClick={() => void moveStatus(selected.id, "cancelled")}>
                  Cancel
                </button>
              </div>
            </div>
          )}

          <div className="glass-panel space-y-3 rounded-3xl p-5">
            <h3 className="font-display text-lg font-bold">Waitlist</h3>
            <p className="text-xs text-muted">Offer an open slot when a cancellation frees the chair</p>
            {waitlist.length === 0 ? (
              <p className="text-sm text-muted">No waitlisted patients.</p>
            ) : (
              <ul className="space-y-2">
                {waitlist.map((a) => (
                  <li
                    key={a.id}
                    className="rounded-2xl border border-brand-100 bg-white/80 px-3 py-2 text-sm"
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData("text/appointment-id", a.id);
                      e.dataTransfer.effectAllowed = "move";
                    }}
                  >
                    <div className="font-semibold">
                      {a.patient
                        ? `${a.patient.first_name} ${a.patient.last_name}`
                        : "Patient"}
                    </div>
                    <div className="text-xs text-muted">
                      Prefers {format(parseISO(a.starts_at), "MMM d HH:mm")}
                      {a.reason ? ` · ${a.reason}` : ""}
                    </div>
                    <button
                      type="button"
                      className="btn-ghost mt-1 text-xs"
                      onClick={() => void offerFromWaitlist(a.id)}
                    >
                      Offer current form time
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {slots.length > 0 && (
            <div className="glass-panel rounded-3xl p-5">
              <span className="ai-badge">AI suggested</span>
              <h3 className="mt-2 font-display text-lg font-bold">Recommended openings</h3>
              <div className="mt-3 space-y-2">
                {slots.map((s) => (
                  <button
                    key={s.starts_at}
                    type="button"
                    className="block w-full rounded-2xl border border-brand-100 bg-white/80 px-3 py-2 text-left text-sm hover:border-brand-400"
                    onClick={() => {
                      const local = format(parseISO(s.starts_at), "yyyy-MM-dd'T'HH:mm");
                      setForm({ ...form, starts_at: local });
                    }}
                  >
                    <div className="font-semibold">
                      {format(parseISO(s.starts_at), "HH:mm")} –{" "}
                      {format(parseISO(s.ends_at), "HH:mm")}
                    </div>
                    <div className="text-xs text-muted">
                      Score {(s.score * 100).toFixed(0)}% · {s.reason}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
