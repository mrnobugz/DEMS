import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Eye, FileDown, Printer, RotateCcw, Search } from "lucide-react";
import { ConfigStatus } from "@/components/config/ConfigUi";
import { EmptyState } from "@/components/EmptyState";
import { ClinicalRecordDialog } from "@/components/records/ClinicalRecordDialog";
import { Pagination } from "@/components/ui/pagination";
import { useAnnounce } from "@/components/ui/sonner";
import { api, ApiError } from "@/lib/api";
import { exportRowsToCsv, printTableSheet, type ExportColumn } from "@/lib/exportTable";
import type { ClinicalRecordRow, Page } from "@/lib/types";

type Staff = { id: string; full_name: string; role?: string };

const DEPARTMENTS = [
  { id: "", label: "All departments" },
  { id: "restorative", label: "Restorative" },
  { id: "maxillofacial", label: "Maxillofacial" },
  { id: "orthodontic", label: "Orthodontic" },
  { id: "paediatric", label: "Paediatric" },
] as const;

const STATUSES = [
  { id: "", label: "Any visit status" },
  { id: "completed", label: "Completed" },
  { id: "in_progress", label: "In progress" },
  { id: "cancelled", label: "Cancelled" },
] as const;

const SORTS = [
  { id: "last_visit", label: "Last visit" },
  { id: "first_visit", label: "First visit" },
  { id: "visits", label: "Number of visits" },
  { id: "name", label: "Surname" },
  { id: "code", label: "File number" },
] as const;

const PAGE_SIZES = [25, 50, 100] as const;
const EXPORT_CAP = 500;

type Filters = {
  q: string;
  department: string;
  examiner: string;
  status: string;
  from: string;
  to: string;
  sort: string;
  descending: boolean;
};

const BLANK: Filters = {
  q: "",
  department: "",
  examiner: "",
  status: "",
  from: "",
  to: "",
  sort: "last_visit",
  descending: true,
};

function dateLabel(value?: string | null) {
  if (!value) return "—";
  const at = new Date(value);
  return Number.isNaN(at.getTime())
    ? value
    : at.toLocaleDateString([], { day: "2-digit", month: "short", year: "numeric" });
}

function titleCase(value?: string | null) {
  if (!value) return "—";
  return value.replaceAll("_", " ").replace(/^./, (c) => c.toUpperCase());
}

function statusTone(status?: string | null) {
  if (status === "completed") return "status-pill--success";
  if (status === "cancelled") return "status-pill--danger";
  return "status-pill--info";
}

const CSV_COLUMNS: ExportColumn<ClinicalRecordRow>[] = [
  { key: "code", header: "File number", value: (r) => r.patient_code },
  { key: "name", header: "Patient", value: (r) => r.full_name },
  { key: "sex", header: "Sex", value: (r) => titleCase(r.sex) },
  { key: "age", header: "Age", value: (r) => r.age_years ?? "", numeric: true },
  { key: "phone", header: "Telephone", value: (r) => r.phone || "" },
  { key: "town", header: "Town / city", value: (r) => r.town_city || "" },
  { key: "department", header: "Department", value: (r) => titleCase(r.department) },
  { key: "clinician", header: "Primary clinician", value: (r) => r.primary_dentist_name || "" },
  { key: "visits", header: "Visits", value: (r) => r.visit_count, numeric: true },
  { key: "first", header: "First visit", value: (r) => r.first_visit_date || "" },
  { key: "last", header: "Last visit", value: (r) => r.last_visit_date || "" },
  { key: "status", header: "Last visit status", value: (r) => titleCase(r.last_visit_status) },
  { key: "complaint", header: "Last complaint", value: (r) => r.last_chief_complaint || "" },
  { key: "examiner", header: "Last examiner", value: (r) => r.last_examiner_name || "" },
  { key: "balance", header: "Balance", value: (r) => (r.has_outstanding ? "Outstanding" : "Settled") },
];

const PRINT_COLUMNS: ExportColumn<ClinicalRecordRow>[] = [
  { key: "code", header: "File no.", value: (r) => r.patient_code },
  { key: "name", header: "Patient", value: (r) => r.full_name },
  {
    key: "who",
    header: "Sex / age",
    value: (r) => `${titleCase(r.sex)}${r.age_years != null ? ` · ${r.age_years}` : ""}`,
  },
  { key: "phone", header: "Telephone", value: (r) => r.phone || "—" },
  { key: "department", header: "Department", value: (r) => titleCase(r.department) },
  { key: "visits", header: "Visits", value: (r) => r.visit_count, numeric: true },
  { key: "first", header: "First visit", value: (r) => dateLabel(r.first_visit_date) },
  { key: "last", header: "Last visit", value: (r) => dateLabel(r.last_visit_date) },
  { key: "complaint", header: "Last complaint", value: (r) => r.last_chief_complaint || "—" },
  { key: "examiner", header: "Examiner", value: (r) => r.last_examiner_name || "—" },
];

export function ClinicalRecordsPage() {
  const [filters, setFilters] = useState<Filters>(BLANK);
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<ClinicalRecordRow[]>([]);
  const [total, setTotal] = useState(0);
  const [limit, setLimit] = useState<number>(25);
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [staff, setStaff] = useState<Staff[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useAnnounce(error);
  const [note, setNote] = useState("");
  const [busyExport, setBusyExport] = useState(false);
  const [preview, setPreview] = useState<string>("");
  const selectAllRef = useRef<HTMLInputElement>(null);

  // Debounced search keeps typing under the Doherty threshold without a request per keystroke.
  useEffect(() => {
    const handle = window.setTimeout(() => {
      setFilters((prev) => (prev.q === search ? prev : { ...prev, q: search }));
      setOffset(0);
    }, 300);
    return () => window.clearTimeout(handle);
  }, [search]);

  const query = useCallback(
    (page: { limit: number; offset: number }) => {
      const params = new URLSearchParams({
        limit: String(page.limit),
        offset: String(page.offset),
        sort: filters.sort,
        descending: String(filters.descending),
      });
      if (filters.q.trim()) params.set("q", filters.q.trim());
      if (filters.department) params.set("department", filters.department);
      if (filters.examiner) params.set("examiner_id", filters.examiner);
      if (filters.status) params.set("status", filters.status);
      if (filters.from) params.set("date_from", filters.from);
      if (filters.to) params.set("date_to", filters.to);
      return `/api/v1/clinical-records?${params.toString()}`;
    },
    [filters],
  );

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError("");
    api<Page<ClinicalRecordRow>>(query({ limit, offset }))
      .then((data) => {
        if (!alive) return;
        setRows(data.items);
        setTotal(data.total);
      })
      .catch((err) => {
        if (!alive) return;
        setRows([]);
        setTotal(0);
        setError(err instanceof ApiError ? err.message : "Could not load clinical records");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [query, limit, offset]);

  useEffect(() => {
    api<Staff[]>("/api/v1/staff/dentists")
      .then(setStaff)
      .catch(() => setStaff([]));
  }, []);

  const pageIds = useMemo(() => rows.map((row) => row.patient_id), [rows]);
  const selectedOnPage = pageIds.filter((id) => selected.has(id)).length;
  const allOnPage = pageIds.length > 0 && selectedOnPage === pageIds.length;

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = selectedOnPage > 0 && !allOnPage;
    }
  }, [selectedOnPage, allOnPage]);

  function setFilter<K extends keyof Filters>(key: K, value: Filters[K]) {
    setFilters((prev) => ({ ...prev, [key]: value }));
    setOffset(0);
  }

  function toggleRow(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAllOnPage() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allOnPage) pageIds.forEach((id) => next.delete(id));
      else pageIds.forEach((id) => next.add(id));
      return next;
    });
  }

  function resetFilters() {
    setSearch("");
    setFilters(BLANK);
    setLimit(25);
    setOffset(0);
    setSelected(new Set());
    setNote("");
  }

  const filterSummary = useMemo(() => {
    const bits: string[] = [];
    if (filters.q.trim()) bits.push(`search "${filters.q.trim()}"`);
    if (filters.department) bits.push(titleCase(filters.department));
    if (filters.status) bits.push(`visits ${titleCase(filters.status)}`);
    if (filters.examiner) {
      bits.push(staff.find((s) => s.id === filters.examiner)?.full_name || "one clinician");
    }
    if (filters.from || filters.to) {
      bits.push(`${filters.from || "start"} → ${filters.to || "today"}`);
    }
    return bits.length ? bits.join(" · ") : "No filters — every patient file";
  }, [filters, staff]);

  /** Selected rows if any, otherwise everything matching the current filters. */
  async function rowsForExport(): Promise<ClinicalRecordRow[] | null> {
    if (selected.size > 0) return rows.filter((row) => selected.has(row.patient_id));
    if (total <= rows.length) return rows;
    setBusyExport(true);
    try {
      const data = await api<Page<ClinicalRecordRow>>(query({ limit: EXPORT_CAP, offset: 0 }));
      if (data.total > EXPORT_CAP) {
        setNote(
          `Exported the first ${EXPORT_CAP} of ${data.total} records. Narrow the filters to export the rest.`,
        );
      }
      return data.items;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not prepare the export");
      return null;
    } finally {
      setBusyExport(false);
    }
  }

  async function exportCsv() {
    setError("");
    setNote("");
    const data = await rowsForExport();
    if (!data?.length) {
      setNote("Nothing to export with the current filters.");
      return;
    }
    exportRowsToCsv(`clinical-records-${new Date().toISOString().slice(0, 10)}`, data, CSV_COLUMNS);
    setNote(`Exported ${data.length} record${data.length === 1 ? "" : "s"} to CSV.`);
  }

  async function exportPdf() {
    setError("");
    setNote("");
    const data = await rowsForExport();
    if (!data?.length) {
      setNote("Nothing to export with the current filters.");
      return;
    }
    try {
      printTableSheet({
        title: "Clinical records — all patients",
        meta: [
          filterSummary,
          `${data.length} of ${total} record${total === 1 ? "" : "s"}`,
          `Printed ${new Date().toLocaleString()}`,
        ],
        rows: data,
        columns: PRINT_COLUMNS,
        footNote: "Confidential clinical record. Handle per clinic data policy.",
      });
      setNote("Print view opened — choose your printer or Save as PDF.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not open the print view");
    }
  }

  const from = total === 0 ? 0 : offset + 1;
  const to = Math.min(offset + rows.length, total);
  const pageCount = Math.max(1, Math.ceil(total / limit));
  const pageIndex = Math.floor(offset / limit) + 1;

  return (
    <div className="clin-shell admin-shell animate-rise space-y-3">
      <div className="clin-head">
        <div>
          <h2 className="font-display text-xl font-bold leading-tight text-brand-900">
            Clinical records
          </h2>
          <p className="text-sm text-muted">
            Every patient file in this clinic. Files without a chair visit are included. Filter, preview, then export.
          </p>
        </div>
        <div className="admin-counts" role="status" aria-label="Register summary">
          <span className="admin-count">
            <strong>{total}</strong> patients
          </span>
          <span className="admin-count">
            <strong>{selected.size}</strong> selected
          </span>
        </div>
      </div>

      <section className="glass-panel space-y-3 rounded-2xl p-4">
        <div className="admin-toolbar">
          <label className="flex-1 text-sm">
            <span className="label">Search the register</span>
            <span className="search-field">
              <Search className="search-field__icon" size={18} aria-hidden />
              <input
                className="input"
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Name, file number, phone, ID, town, or complaint"
                autoComplete="off"
              />
            </span>
          </label>
          <button
            type="button"
            className="btn-ghost inline-flex items-center gap-2 self-end"
            onClick={resetFilters}
          >
            <RotateCcw size={16} aria-hidden /> Reset
          </button>
        </div>

        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          <label className="text-sm">
            <span className="label">Department</span>
            <select
              className="input"
              value={filters.department}
              onChange={(e) => setFilter("department", e.target.value)}
            >
              {DEPARTMENTS.map((row) => (
                <option key={row.id || "all"} value={row.id}>
                  {row.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="label">Seen by</span>
            <select
              className="input"
              value={filters.examiner}
              onChange={(e) => setFilter("examiner", e.target.value)}
            >
              <option value="">Any clinician</option>
              {staff.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.full_name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="label">Visit status</span>
            <select
              className="input"
              value={filters.status}
              onChange={(e) => setFilter("status", e.target.value)}
            >
              {STATUSES.map((row) => (
                <option key={row.id || "any"} value={row.id}>
                  {row.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="label">Visited from</span>
            <input
              className="input"
              type="date"
              value={filters.from}
              max={filters.to || undefined}
              onChange={(e) => setFilter("from", e.target.value)}
            />
          </label>
          <label className="text-sm">
            <span className="label">Visited until</span>
            <input
              className="input"
              type="date"
              value={filters.to}
              min={filters.from || undefined}
              onChange={(e) => setFilter("to", e.target.value)}
            />
          </label>
          <label className="text-sm">
            <span className="label">Sort by</span>
            <div className="flex gap-2">
              <select
                className="input"
                value={filters.sort}
                onChange={(e) => setFilter("sort", e.target.value)}
              >
                {SORTS.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="btn-ghost shrink-0 text-sm"
                aria-pressed={filters.descending}
                onClick={() => setFilter("descending", !filters.descending)}
              >
                {filters.descending ? "Newest first" : "Oldest first"}
              </button>
            </div>
          </label>
        </div>

        <div className="rec-bulk">
          <span className="rec-bulk__count">
            {selected.size > 0
              ? `${selected.size} patient${selected.size === 1 ? "" : "s"} selected`
              : `Exporting all ${total} matching record${total === 1 ? "" : "s"}`}
          </span>
          <button
            type="button"
            className="btn-ghost inline-flex items-center gap-2 text-sm"
            disabled={busyExport || total === 0}
            onClick={() => void exportCsv()}
          >
            <FileDown size={16} aria-hidden /> Export CSV
          </button>
          <button
            type="button"
            className="btn-ghost inline-flex items-center gap-2 text-sm"
            disabled={busyExport || total === 0}
            onClick={() => void exportPdf()}
          >
            <Printer size={16} aria-hidden /> Export PDF
          </button>
          {selected.size > 0 && (
            <button
              type="button"
              className="btn-ghost text-sm"
              onClick={() => setSelected(new Set())}
            >
              Clear selection
            </button>
          )}
          <span className="ml-auto text-xs text-muted">{filterSummary}</span>
        </div>

        <ConfigStatus loading={loading} error={error} ok={note} />

        {!loading && !error && rows.length === 0 ? (
          <EmptyState
            title="No patients match these filters"
            hint="Clear the filters, or check that clinical visits have been recorded for the period."
          />
        ) : (
          <>
            <div className="admin-scroll">
              <table className="admin-table">
                <caption className="sr-only">
                  Every patient file at this clinic, with visit counts when a chair visit exists
                </caption>
                <thead>
                  <tr>
                    <th className="rec-select">
                      <input
                        ref={selectAllRef}
                        type="checkbox"
                        checked={allOnPage}
                        onChange={toggleAllOnPage}
                        aria-label={allOnPage ? "Clear selection on this page" : "Select all on this page"}
                      />
                    </th>
                    <th className="rec-num">#</th>
                    <th>File no.</th>
                    <th>Patient</th>
                    <th>Sex / age</th>
                    <th>Telephone</th>
                    <th>Department</th>
                    <th>Visits</th>
                    <th>First visit</th>
                    <th>Last visit</th>
                    <th>Last complaint</th>
                    <th>Seen by</th>
                    <th className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, index) => {
                    const on = selected.has(row.patient_id);
                    return (
                      <tr key={row.patient_id} className={on ? "rec-row--on" : ""}>
                        <td className="rec-select">
                          <input
                            type="checkbox"
                            checked={on}
                            onChange={() => toggleRow(row.patient_id)}
                            aria-label={`Select ${row.full_name}`}
                          />
                        </td>
                        <td className="rec-num">{offset + index + 1}</td>
                        <td className="font-mono text-xs">{row.patient_code}</td>
                        <td>
                          <span className="font-semibold text-ink">{row.full_name}</span>
                          {row.has_outstanding && (
                            <span className="ml-2 status-pill status-pill--warning">Balance</span>
                          )}
                        </td>
                        <td>
                          {titleCase(row.sex)}
                          {row.age_years != null ? ` · ${row.age_years}` : ""}
                        </td>
                        <td>{row.phone || "—"}</td>
                        <td>{titleCase(row.department)}</td>
                        <td className="tabular-nums">{row.visit_count}</td>
                        <td>{dateLabel(row.first_visit_date)}</td>
                        <td>
                          {dateLabel(row.last_visit_date)}
                          {row.last_visit_status && (
                            <span className={`ml-2 status-pill ${statusTone(row.last_visit_status)}`}>
                              {titleCase(row.last_visit_status)}
                            </span>
                          )}
                        </td>
                        <td className="max-w-[14rem] truncate" title={row.last_chief_complaint || ""}>
                          {row.last_chief_complaint || "—"}
                        </td>
                        <td>{row.last_examiner_name || "—"}</td>
                        <td className="text-right">
                          <div className="inline-flex flex-wrap items-center justify-end gap-1">
                            <button
                              type="button"
                              className="btn-ghost inline-flex items-center gap-1 text-xs"
                              onClick={() => setPreview(row.patient_id)}
                            >
                              <Eye size={14} aria-hidden /> Preview
                            </button>
                            <Link className="btn-ghost text-xs" to={`/patients/${row.patient_id}`}>
                              Full file
                            </Link>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="rec-pager">
              <p className="rec-pager__info" role="status" aria-live="polite">
                {total === 0
                  ? "No records"
                  : `Showing ${from}–${to} of ${total} · page ${pageIndex} of ${pageCount}`}
              </p>
              <div className="rec-pager__controls">
                <label className="text-sm">
                  <span className="sr-only">Rows per page</span>
                  <select
                    className="input"
                    value={limit}
                    onChange={(e) => {
                      setLimit(Number(e.target.value));
                      setOffset(0);
                    }}
                  >
                    {PAGE_SIZES.map((size) => (
                      <option key={size} value={size}>
                        {size} per page
                      </option>
                    ))}
                  </select>
                </label>
                <Pagination
                  page={pageIndex}
                  pageCount={pageCount}
                  disabled={loading}
                  onPage={(page) => setOffset(Math.max(0, (page - 1) * limit))}
                />
              </div>
            </div>
          </>
        )}
      </section>

      {preview && (
        <ClinicalRecordDialog patientId={preview} onClose={() => setPreview("")} />
      )}
    </div>
  );
}
