import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ConfigField, ConfigStatus, onTabListKeyDown } from "@/components/config/ConfigUi";
import { EmptyState } from "@/components/EmptyState";
import {
  VitalSignsDetails,
  VitalSignsForm,
  draftToPayload,
  emptyVitalsDraft,
  readingToDraft,
  type VitalSignsDraft,
} from "@/components/VitalSignsPanel";
import { Pagination } from "@/components/ui/pagination";
import { useAnnounce } from "@/components/ui/sonner";
import { api, ApiError } from "@/lib/api";
import type { Page, Patient, PatientVitalSign, VitalsWorklistItem } from "@/lib/types";

const TABS = [
  { id: "needed", label: "Need vitals" },
  { id: "recorded", label: "Recorded" },
  { id: "all", label: "All patients" },
] as const;

type Tab = (typeof TABS)[number]["id"];

const PAGE_SIZES = [10, 20] as const;

function whenLabel(iso?: string | null) {
  if (!iso) return "";
  const at = new Date(iso);
  return Number.isNaN(at.getTime()) ? iso : at.toLocaleString();
}

export function VitalSignsPage() {
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [tab, setTab] = useState<Tab>("needed");
  const [rows, setRows] = useState<VitalsWorklistItem[]>([]);
  const [total, setTotal] = useState(0);
  const [limit, setLimit] = useState<(typeof PAGE_SIZES)[number]>(10);
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState<Patient | null>(null);
  const [latest, setLatest] = useState<PatientVitalSign | null>(null);
  const [history, setHistory] = useState<PatientVitalSign[]>([]);
  const [draft, setDraft] = useState<VitalSignsDraft>(emptyVitalsDraft());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  useAnnounce(error);
  useAnnounce(ok);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(query.trim()), 280);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    setOffset(0);
  }, [debounced, tab, limit]);

  async function loadWorklist(nextOffset = offset) {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({
        status: debounced ? "all" : tab,
        limit: String(limit),
        offset: String(nextOffset),
      });
      if (debounced) params.set("q", debounced);
      const page = await api<Page<VitalsWorklistItem>>(`/api/v1/patients/vitals-worklist?${params}`);
      setRows(page.items);
      setTotal(page.total);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load patients");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadWorklist(offset);
  }, [debounced, tab, limit, offset]);

  async function openPatient(row: Patient) {
    setSelected(row);
    setError("");
    setOk("");
    const [last, list] = await Promise.all([
      api<PatientVitalSign | null>(`/api/v1/patients/${row.id}/vitals/latest`),
      api<PatientVitalSign[]>(`/api/v1/patients/${row.id}/vitals`),
    ]);
    setLatest(last);
    setHistory(list);
    setDraft(last ? readingToDraft(last) : emptyVitalsDraft());
  }

  const selectedName = selected ? `${selected.first_name} ${selected.last_name}` : "";
  const pageCount = Math.max(1, Math.ceil(total / limit));
  const pageIndex = total === 0 ? 0 : Math.floor(offset / limit);
  const from = total === 0 ? 0 : offset + 1;
  const to = offset + rows.length;
  const updating = Boolean(latest);

  const emptyHint = useMemo(() => {
    if (debounced) return "Try another name, file number, or phone.";
    if (tab === "needed") return "Every file already has a reading, or there are no patient files yet.";
    if (tab === "recorded") return "No recorded vitals yet. Capture a first reading on Need vitals.";
    return "No patient files yet. They appear here as soon as they exist in Patients.";
  }, [debounced, tab]);

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
      setHistory((list) => [saved, ...list]);
      setDraft(readingToDraft(saved));
      setOk(updating ? `Updated reading saved for ${selectedName}` : `Vital signs saved for ${selectedName}`);
      await loadWorklist(offset);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save vital signs");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="clin-shell admin-shell animate-rise space-y-3">
      <div>
        <h2 className="font-display text-xl font-bold text-brand-900">Vital signs</h2>
        <p className="text-sm text-muted">
          Search every patient file, including drafts. Capture a first reading, or open a recorded file to update it.
        </p>
      </div>

      <div className="grid gap-3 lg:grid-cols-[minmax(18rem,24rem)_1fr]">
        <section className="glass-panel space-y-3 p-4">
          <ConfigField label="Find a patient" hint="Searches every file: name, file number, phone, or complaint">
            <input
              className="input"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoComplete="off"
              placeholder="e.g. Amina, P-1042, 0712…"
            />
          </ConfigField>

          <div
            className="admin-tabs"
            role="tablist"
            aria-label="Vitals worklist"
            onKeyDown={(e) =>
              onTabListKeyDown(
                e,
                TABS.map((row) => row.id),
                tab,
                (id) => {
                  setTab(id);
                  queueMicrotask(() => document.getElementById(`vitals-tab-${id}`)?.focus());
                },
              )
            }
          >
            {TABS.map((row) => (
              <button
                key={row.id}
                id={`vitals-tab-${row.id}`}
                type="button"
                role="tab"
                aria-selected={tab === row.id}
                tabIndex={tab === row.id ? 0 : -1}
                className={`admin-tab ${tab === row.id ? "admin-tab--on" : ""}`}
                onClick={() => setTab(row.id)}
              >
                {row.label}
              </button>
            ))}
          </div>

          <ConfigStatus loading={loading} error={error} ok={ok} />

          {rows.length === 0 && !loading ? (
            <EmptyState title="No patients in this list" hint={emptyHint} />
          ) : (
            <>
              <ul className="vitals-list">
                {rows.map((row, index) => {
                  const p = row.patient;
                  const on = selected?.id === p.id;
                  return (
                    <li key={p.id}>
                      <button
                        type="button"
                        className={`vitals-row ${on ? "vitals-row--on" : ""}`}
                        onClick={() => void openPatient(p)}
                      >
                        <span className="rec-num" aria-hidden>
                          {offset + index + 1}
                        </span>
                        <span className="min-w-0 flex-1 text-left">
                          <span className="block font-semibold text-brand-900">
                            {p.first_name} {p.last_name}
                          </span>
                          <span className="block text-sm text-muted">
                            {p.patient_code}
                            {p.phone ? ` · ${p.phone}` : ""}
                            {p.chief_complaint ? ` · ${p.chief_complaint}` : ""}
                          </span>
                          {row.has_vitals && row.last_recorded_at && (
                            <span className="block text-sm text-muted">Last {whenLabel(row.last_recorded_at)}</span>
                          )}
                        </span>
                        <span className={`status-pill ${row.has_vitals ? "status-pill--success" : "status-pill--warning"}`}>
                          {row.has_vitals ? "Recorded" : "Needed"}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
              <div className="rec-pager">
                <p className="rec-pager__info" role="status" aria-live="polite">
                  {total === 0 ? "No patients" : `Showing ${from}–${to} of ${total} · page ${pageIndex + 1} of ${pageCount}`}
                </p>
                <div className="rec-pager__controls">
                  <label className="text-sm">
                    <span className="label">Per page</span>
                    <select
                      className="input"
                      value={limit}
                      onChange={(e) => setLimit(Number(e.target.value) as (typeof PAGE_SIZES)[number])}
                    >
                      {PAGE_SIZES.map((size) => (
                        <option key={size} value={size}>
                          {size}
                        </option>
                      ))}
                    </select>
                  </label>
                  <Pagination
                    page={pageIndex + 1}
                    pageCount={pageCount}
                    disabled={loading}
                    onPage={(page) => setOffset(Math.max(0, (page - 1) * limit))}
                  />
                </div>
              </div>
            </>
          )}
        </section>

        <section className="glass-panel space-y-3 p-4">
          {!selected ? (
            <EmptyState
              title="Select a patient"
              hint="Type in the search bar or pick someone who still needs vitals, or open a recorded file to update."
            />
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
              <VitalSignsDetails
                reading={latest}
                hint={
                  latest
                    ? "Saving stores a new reading. Last values are filled in so you can correct them."
                    : "No reading yet. Enter the first set of vital signs."
                }
              />
              <form className="space-y-3" onSubmit={onSave}>
                <h4 className="reg-section__title">{updating ? "Update reading" : "First reading"}</h4>
                <VitalSignsForm draft={draft} onChange={setDraft} />
                {latest && (
                  <button
                    type="button"
                    className="btn-ghost"
                    onClick={() => setDraft(readingToDraft(latest))}
                  >
                    Fill from last reading
                  </button>
                )}
                <button className="btn-primary" type="submit" disabled={saving}>
                  {saving ? "Saving…" : updating ? "Save updated reading" : "Save vital signs"}
                </button>
              </form>
              {history.length > 1 && (
                <div>
                  <h4 className="reg-section__title">Earlier readings</h4>
                  <ul className="admin-list">
                    {history.slice(1, 8).map((row) => (
                      <li key={row.id}>
                        <div>
                          <div className="font-semibold text-sm">{whenLabel(row.recorded_at)}</div>
                          <div className="text-sm text-muted">
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
