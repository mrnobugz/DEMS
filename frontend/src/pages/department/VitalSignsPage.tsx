import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { EmptyState } from "@/components/EmptyState";
import {
  VitalSignsDetails,
  VitalSignsForm,
  draftToPayload,
  emptyVitalsDraft,
  type VitalSignsDraft,
} from "@/components/VitalSignsPanel";
import { api, ApiError } from "@/lib/api";
import type { Appointment, Page, Patient, PatientVitalSign } from "@/lib/types";

export function VitalSignsPage() {
  const [query, setQuery] = useState("");
  const [patients, setPatients] = useState<Patient[]>([]);
  const [today, setToday] = useState<Appointment[]>([]);
  const [selected, setSelected] = useState<Patient | null>(null);
  const [latest, setLatest] = useState<PatientVitalSign | null>(null);
  const [history, setHistory] = useState<PatientVitalSign[]>([]);
  const [draft, setDraft] = useState<VitalSignsDraft>(emptyVitalsDraft());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");

  async function loadDirectory(search = "") {
    const [page, appts] = await Promise.all([
      api<Page<Patient>>(`/api/v1/patients?limit=40&q=${encodeURIComponent(search)}`),
      api<Appointment[]>(
        `/api/v1/appointments?start=${encodeURIComponent(dayStart())}&end=${encodeURIComponent(dayEnd())}`,
      ).catch(() => [] as Appointment[]),
    ]);
    setPatients(page.items.filter((p) => p.registration_status === "finalized"));
    setToday(appts.filter((a) => a.patient && a.patient.registration_status === "finalized"));
  }

  async function openPatient(row: Patient) {
    setSelected(row);
    setError("");
    setOk("");
    setDraft(emptyVitalsDraft());
    const [last, rows] = await Promise.all([
      api<PatientVitalSign | null>(`/api/v1/patients/${row.id}/vitals/latest`),
      api<PatientVitalSign[]>(`/api/v1/patients/${row.id}/vitals`),
    ]);
    setLatest(last);
    setHistory(rows);
  }

  useEffect(() => {
    setLoading(true);
    loadDirectory("")
      .catch((err) => setError(err instanceof ApiError ? err.message : "Could not load patients"))
      .finally(() => setLoading(false));
  }, []);

  const selectedName = selected ? `${selected.first_name} ${selected.last_name}` : "";

  const queuePatients = useMemo(() => {
    const seen = new Set<string>();
    const rows: Patient[] = [];
    for (const appt of today) {
      if (!appt.patient || seen.has(appt.patient.id)) continue;
      seen.add(appt.patient.id);
      rows.push(appt.patient);
    }
    return rows;
  }, [today]);

  async function onSave(e: FormEvent) {
    e.preventDefault();
    if (!selected) return;
    setSaving(true);
    setError("");
    setOk("");
    try {
      const saved = await api<PatientVitalSign>(`/api/v1/patients/${selected.id}/vitals`, {
        method: "POST",
        body: JSON.stringify(draftToPayload(draft)),
      });
      setLatest(saved);
      setHistory((rows) => [saved, ...rows]);
      setDraft(emptyVitalsDraft());
      setOk(`Vital signs saved for ${selectedName}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save vital signs");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="clin-shell animate-rise space-y-3">
      <div>
        <h2 className="font-display text-xl font-bold text-brand-900">Vital signs</h2>
        <p className="text-sm text-muted">
          Record BP, pulse, temperature, and related readings for a registered patient. They appear on clerkship details and the clinical exam.
        </p>
      </div>

      <div className="grid gap-3 lg:grid-cols-[minmax(16rem,22rem)_1fr]">
        <section className="glass-panel space-y-3">
          <label className="text-sm">
            <span className="label">Find registered patient</span>
            <input
              className="input"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void loadDirectory(query).catch((err) =>
                    setError(err instanceof ApiError ? err.message : "Search failed"),
                  );
                }
              }}
            />
          </label>
          <button
            type="button"
            className="btn-ghost"
            onClick={() => void loadDirectory(query)}
          >
            Search
          </button>
          <div role="status" aria-live="polite">
            {loading && <p className="text-sm text-muted">Loading…</p>}
            {error && <p className="text-sm font-semibold text-red-700">{error}</p>}
            {ok && <p className="text-sm font-semibold text-brand-800">{ok}</p>}
          </div>
          {queuePatients.length > 0 && (
            <div>
              <h3 className="text-sm font-bold text-brand-900">Today’s queue</h3>
              <ul className="admin-list">
                {queuePatients.map((p) => (
                  <li key={p.id}>
                    <button type="button" className="btn-ghost text-sm" onClick={() => void openPatient(p)}>
                      {p.patient_code} · {p.first_name} {p.last_name}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div>
            <h3 className="text-sm font-bold text-brand-900">Registered patients</h3>
            {patients.length === 0 && !loading ? (
              <EmptyState
                title="No registered patients"
                hint="Finalize registration at the front desk, then search here."
              />
            ) : (
              <ul className="admin-list">
                {patients.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      className={`btn-ghost text-sm ${selected?.id === p.id ? "font-bold text-brand-800" : ""}`}
                      onClick={() => void openPatient(p)}
                    >
                      {p.patient_code} · {p.first_name} {p.last_name}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <section className="glass-panel space-y-3">
          {!selected ? (
            <EmptyState title="Select a patient" hint="Search or pick from today’s queue, then enter vital signs." />
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="font-display text-base font-bold text-brand-900">{selectedName}</h3>
                  <p className="text-sm text-muted">
                    {selected.patient_code}
                    {selected.chief_complaint ? ` · ${selected.chief_complaint}` : ""}
                  </p>
                </div>
                <Link className="btn-ghost" to={`/patients/${selected.id}`}>
                  Open clerkship
                </Link>
              </div>
              <VitalSignsDetails reading={latest} hint="This reading is shown on clerkship details and pre-filled in the clinical exam." />
              <form className="space-y-3" onSubmit={onSave}>
                <h4 className="reg-section__title">New reading</h4>
                <VitalSignsForm draft={draft} onChange={setDraft} />
                <button className="btn-primary" type="submit" disabled={saving}>
                  {saving ? "Saving…" : "Save vital signs"}
                </button>
              </form>
              {history.length > 1 && (
                <div>
                  <h4 className="reg-section__title">Earlier readings</h4>
                  <ul className="admin-list">
                    {history.slice(1, 8).map((row) => (
                      <li key={row.id}>
                        <div>
                          <div className="font-semibold">{new Date(row.recorded_at).toLocaleString()}</div>
                          <div className="text-xs text-muted">
                            {row.bp_systolic != null ? `BP ${row.bp_systolic}/${row.bp_diastolic}` : "—"}
                            {row.pulse != null ? ` · ${row.pulse} bpm` : ""}
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}

function dayStart() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function dayEnd() {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d.toISOString();
}
