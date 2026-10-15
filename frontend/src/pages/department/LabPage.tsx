import { FormEvent, KeyboardEvent, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { format, isValid, parseISO } from "date-fns";
import {
  AlertTriangle,
  Building2,
  Calendar,
  CheckCircle2,
  Clock,
  ExternalLink,
  FileText,
  Filter,
  FlaskConical,
  Layers,
  LayoutGrid,
  List,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Truck,
  User,
  Wallet,
  X,
} from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { Modal } from "@/components/Modal";
import { ConfigField, ConfigStatus, ConfirmAction, onTabListKeyDown } from "@/components/config/ConfigUi";
import { useAnnounce } from "@/components/ui/sonner";
import { ApiError, api } from "@/lib/api";
import { formatMoney } from "@/lib/i18n";
import { useUiPrefs } from "@/lib/uiPrefs";
import { useDepartmentHome } from "./FrontClinicalPages";

export type LabCase = {
  id: string;
  patient_id: string;
  patient_name?: string | null;
  patient_code?: string | null;
  dentist_id?: string | null;
  dentist_name?: string | null;
  tooth?: string | null;
  shade?: string | null;
  case_type: string;
  status: string;
  lab_name?: string | null;
  lab_cost: number;
  due_at?: string | null;
  sent_at?: string | null;
  received_at?: string | null;
  fitted_at?: string | null;
  notes?: string | null;
  is_overdue?: boolean;
  restoration_id?: string | null;
  restoration_case_id?: string | null;
  created_at?: string;
};

type Restoration = {
  id: string;
  tooth_number: string;
  restoration_type: string;
  status: string;
  case_id?: string | null;
};

type PatientHit = {
  id: string;
  first_name: string;
  last_name: string;
  patient_code: string;
};

const ALL_STATUSES = ["draft", "sent", "in_progress", "received", "fitted", "cancelled"] as const;
type LabStatusKey = (typeof ALL_STATUSES)[number];

const STATUS_METADATA: Record<
  string,
  {
    label: string;
    badge: string;
    nextStatus?: string;
    nextLabel?: string;
    description: string;
  }
> = {
  draft: {
    label: "Draft",
    badge: "bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700",
    nextStatus: "sent",
    nextLabel: "Dispatch to Lab",
    description: "Scan or impression taken. Awaiting courier or dispatch.",
  },
  sent: {
    label: "Sent to Lab",
    badge: "bg-sky-50 text-sky-800 border-sky-300 dark:bg-sky-950/50 dark:text-sky-300 dark:border-sky-800",
    nextStatus: "in_progress",
    nextLabel: "Start Fabrication",
    description: "Dispatched to external lab partner.",
  },
  in_progress: {
    label: "In Fabrication",
    badge: "bg-amber-50 text-amber-800 border-amber-300 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800",
    nextStatus: "received",
    nextLabel: "Mark Received",
    description: "Prosthesis being manufactured by dental technician.",
  },
  received: {
    label: "Ready / Received",
    badge: "bg-emerald-50 text-emerald-800 border-emerald-300 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800",
    nextStatus: "fitted",
    nextLabel: "Seat & Cement",
    description: "Prosthesis delivered to clinic and inspected. Ready for seating.",
  },
  fitted: {
    label: "Fitted & Delivered",
    badge: "bg-purple-50 text-purple-800 border-purple-300 dark:bg-purple-950/50 dark:text-purple-300 dark:border-purple-800",
    description: "Inserted into patient mouth and verified chairside.",
  },
  cancelled: {
    label: "Cancelled",
    badge: "bg-rose-50 text-rose-800 border-rose-300 dark:bg-rose-950/50 dark:text-rose-300 dark:border-rose-800",
    description: "Remake or abandoned case.",
  },
};

const KANBAN_STAGES = ["sent", "in_progress", "received", "fitted"] as const;

const CASE_TYPE_PRESETS = [
  "Crown (PFM / Zirconia / Emax)",
  "Bridge (3+ units)",
  "Veneer / Laminate",
  "Inlay / Onlay",
  "Full Complete Denture",
  "Partial Acrylic Denture",
  "Cast Partial Denture (Co-Cr)",
  "Implant Crown & Custom Abutment",
  "Night Guard / Occlusal Splint",
  "Orthodontic Retainer / Clear Aligner",
  "Remake / Repair",
];

const SHADE_PRESETS = [
  "A1",
  "A2",
  "A3",
  "A3.5",
  "A4",
  "B1",
  "B2",
  "B3",
  "B4",
  "C1",
  "C2",
  "C3",
  "D2",
  "D3",
  "BL1 (Bleach)",
  "BL2",
  "BL3",
  "BL4",
];

const LAB_PARTNERS = [
  "SmileLab Pro",
  "Precision Dental Craft",
  "Apex Milling Center",
  "In-House CAD/CAM Lab",
  "Metro Ceramic Studio",
];

function formatDateSafe(val?: string | null, pattern = "MMM d, yyyy") {
  if (!val) return "";
  try {
    const d = parseISO(val);
    return isValid(d) ? format(d, pattern) : "";
  } catch {
    return "";
  }
}

function explainError(err: unknown, fallback: string) {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return fallback;
}

export function LabPage() {
  const { home } = useDepartmentHome();
  const currency = useUiPrefs((s) => s.currency);
  const locale = useUiPrefs((s) => s.locale);

  const [cases, setCases] = useState<LabCase[]>([]);
  const [overdue, setOverdue] = useState<LabCase[]>([]);
  const [patients, setPatients] = useState<PatientHit[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [okMessage, setOkMessage] = useState("");

  // Views & Filters
  const [viewMode, setViewMode] = useState<"board" | "table">("board");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  // New Case Dialog State
  const [modalOpen, setModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [patientQuery, setPatientQuery] = useState("");
  const [patientHits, setPatientHits] = useState<PatientHit[]>([]);
  const [selectedPatient, setSelectedPatient] = useState<PatientHit | null>(null);
  const [patientRestorations, setPatientRestorations] = useState<Restoration[]>([]);
  const [selectedRestorationId, setSelectedRestorationId] = useState("");

  const [formData, setFormData] = useState({
    tooth: "",
    shade: "A2",
    case_type: "Crown (PFM / Zirconia / Emax)",
    lab_name: "SmileLab Pro",
    status: "sent",
    due_at: "",
    lab_cost: 0,
    notes: "",
  });

  useAnnounce(error);
  useAnnounce(okMessage);

  // Default due date to 7 business days ahead
  function getSuggestedDueDate(days = 7) {
    const target = new Date();
    target.setDate(target.getDate() + days);
    target.setHours(17, 0, 0, 0);
    return target.toISOString().slice(0, 16);
  }

  // Load cases and initial patient roster
  async function loadData(isRefresh = false) {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError("");

    try {
      const [allCases, overdueCases, patientList] = await Promise.all([
        api<LabCase[]>("/api/v1/lab/cases"),
        api<LabCase[]>("/api/v1/lab/cases/overdue"),
        api<{ items: PatientHit[] }>("/api/v1/patients?limit=50"),
      ]);

      setCases(allCases);
      setOverdue(overdueCases);
      setPatients(patientList.items);
    } catch (err) {
      setError(explainError(err, "Failed to load laboratory cases"));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, []);

  // Debounced search for patients inside modal
  useEffect(() => {
    const trimmed = patientQuery.trim();
    if (!trimmed || (selectedPatient && `${selectedPatient.first_name} ${selectedPatient.last_name}` === trimmed)) {
      setPatientHits([]);
      return;
    }
    const timer = window.setTimeout(() => {
      void api<{ items: PatientHit[] }>(`/api/v1/patients?limit=8&q=${encodeURIComponent(trimmed)}`)
        .then((res) => setPatientHits(res.items))
        .catch(() => setPatientHits([]));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [patientQuery, selectedPatient]);

  // Load restorations when patient is selected
  async function handlePatientSelect(patient: PatientHit) {
    setSelectedPatient(patient);
    setPatientQuery(`${patient.first_name} ${patient.last_name} (${patient.patient_code})`);
    setPatientHits([]);
    setSelectedRestorationId("");

    try {
      const restos = await api<Restoration[]>(`/api/v1/clinical/patients/${patient.id}/restorations`).catch(
        () => [] as Restoration[],
      );
      setPatientRestorations(restos);
    } catch {
      setPatientRestorations([]);
    }
  }

  function handleRestorationSelect(restoId: string) {
    setSelectedRestorationId(restoId);
    const resto = patientRestorations.find((r) => r.id === restoId);
    if (resto) {
      setFormData((prev) => ({
        ...prev,
        tooth: resto.tooth_number || prev.tooth,
        case_type: resto.restoration_type?.toLowerCase().includes("crown")
          ? "Crown (PFM / Zirconia / Emax)"
          : resto.restoration_type || prev.case_type,
      }));
    }
  }

  function openNewCaseModal() {
    setFormData({
      tooth: "",
      shade: "A2",
      case_type: "Crown (PFM / Zirconia / Emax)",
      lab_name: "SmileLab Pro",
      status: "sent",
      due_at: getSuggestedDueDate(7),
      lab_cost: 0,
      notes: "",
    });
    setSelectedPatient(patients[0] || null);
    if (patients[0]) {
      setPatientQuery(`${patients[0].first_name} ${patients[0].last_name} (${patients[0].patient_code})`);
      void api<Restoration[]>(`/api/v1/clinical/patients/${patients[0].id}/restorations`)
        .then(setPatientRestorations)
        .catch(() => setPatientRestorations([]));
    } else {
      setPatientQuery("");
      setPatientRestorations([]);
    }
    setSelectedRestorationId("");
    setError("");
    setOkMessage("");
    setModalOpen(true);
  }

  async function handleCreateCase(e: FormEvent) {
    e.preventDefault();
    if (!selectedPatient) {
      setError("Please choose a patient for this lab case");
      return;
    }
    setSubmitting(true);
    setError("");

    try {
      const selectedResto = patientRestorations.find((r) => r.id === selectedRestorationId);
      const parsedCost = Number(formData.lab_cost) || 0;

      await api<LabCase>("/api/v1/lab/cases", {
        method: "POST",
        body: JSON.stringify({
          patient_id: selectedPatient.id,
          tooth: formData.tooth.trim() || selectedResto?.tooth_number || null,
          shade: formData.shade.trim() || null,
          case_type: formData.case_type.trim(),
          lab_name: formData.lab_name.trim() || null,
          status: formData.status,
          lab_cost: parsedCost,
          due_at: formData.due_at ? new Date(formData.due_at).toISOString() : null,
          notes: formData.notes.trim() || null,
          restoration_id: selectedRestorationId || null,
          restoration_case_id: selectedResto?.case_id || null,
        }),
      });

      setOkMessage(`Lab case for ${selectedPatient.first_name} ${selectedPatient.last_name} created successfully.`);
      setModalOpen(false);
      await loadData();
    } catch (err) {
      setError(explainError(err, "Could not create lab case"));
    } finally {
      setSubmitting(false);
    }
  }

  async function updateStatus(id: string, newStatus: string) {
    setError("");
    setOkMessage("");
    try {
      const updated = await api<LabCase>(`/api/v1/lab/cases/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: newStatus }),
      });
      const stMeta = STATUS_METADATA[newStatus];
      setOkMessage(`Case status updated to "${stMeta?.label || newStatus}".`);
      setCases((prev) => prev.map((c) => (c.id === id ? { ...c, ...updated } : c)));
      setOverdue((prev) => (newStatus === "fitted" || newStatus === "cancelled" ? prev.filter((c) => c.id !== id) : prev));
    } catch (err) {
      setError(explainError(err, "Failed to update case status"));
    }
  }

  // Patient directory map for instant fast lookups
  const patientDirectory = useMemo(() => {
    const map = new Map<string, PatientHit>();
    patients.forEach((p) => map.set(p.id, p));
    return map;
  }, [patients]);

  const overdueIdSet = useMemo(() => new Set(overdue.map((c) => c.id)), [overdue]);

  // Filtered cases
  const filteredCases = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return cases.filter((c) => {
      // Status filter
      if (statusFilter === "overdue") {
        if (!c.is_overdue && !overdueIdSet.has(c.id)) return false;
      } else if (statusFilter === "active") {
        if (c.status === "fitted" || c.status === "cancelled") return false;
      } else if (statusFilter !== "all" && c.status !== statusFilter) {
        return false;
      }

      // Search filter
      if (!q) return true;
      const p = patientDirectory.get(c.patient_id);
      const patientFullName = `${p?.first_name || ""} ${p?.last_name || ""} ${c.patient_name || ""}`.toLowerCase();
      const patientCode = (p?.patient_code || c.patient_code || "").toLowerCase();
      const tooth = (c.tooth || "").toLowerCase();
      const caseType = (c.case_type || "").toLowerCase();
      const labName = (c.lab_name || "").toLowerCase();
      const shade = (c.shade || "").toLowerCase();

      return (
        patientFullName.includes(q) ||
        patientCode.includes(q) ||
        tooth.includes(q) ||
        caseType.includes(q) ||
        labName.includes(q) ||
        shade.includes(q)
      );
    });
  }, [cases, statusFilter, searchQuery, overdueIdSet, patientDirectory]);

  // Derived metrics
  const activeCasesCount = useMemo(
    () => cases.filter((c) => c.status === "sent" || c.status === "in_progress").length,
    [cases],
  );
  const readyCasesCount = useMemo(() => cases.filter((c) => c.status === "received").length, [cases]);
  const fittedCasesCount = useMemo(() => cases.filter((c) => c.status === "fitted").length, [cases]);
  const totalCostActive = useMemo(
    () =>
      cases
        .filter((c) => c.status !== "cancelled")
        .reduce((sum, c) => sum + (c.lab_cost || 0), 0),
    [cases],
  );

  const filterTabs = [
    { id: "all", label: "All Cases", count: cases.length },
    { id: "active", label: "In Flight", count: activeCasesCount },
    { id: "received", label: "Ready to Fit", count: readyCasesCount },
    { id: "fitted", label: "Completed", count: fittedCasesCount },
    { id: "draft", label: "Drafts", count: cases.filter((c) => c.status === "draft").length },
    { id: "cancelled", label: "Cancelled", count: cases.filter((c) => c.status === "cancelled").length },
  ];

  return (
    <div className="clin-shell space-y-6">
      {/* 1. Header Area */}
      <header className="clin-head flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-700 dark:bg-brand-950/60 dark:text-brand-300">
              <FlaskConical size={22} aria-hidden />
            </span>
            <div>
              <h2 className="font-display text-2xl font-bold text-brand-900 dark:text-brand-100">Dental Laboratory</h2>
              <p className="text-sm text-muted">
                Manage crown & bridge fabrication, track partner labs, and seat prosthetics chairside.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            className="btn-ghost min-h-[var(--touch-min)] min-w-[var(--touch-min)] gap-2 px-3 text-muted hover:text-ink"
            onClick={() => void loadData(true)}
            disabled={refreshing || loading}
            aria-label="Refresh lab cases"
            title="Refresh"
          >
            <RefreshCw size={18} className={refreshing ? "animate-spin text-brand-600" : ""} aria-hidden />
            <span className="hidden sm:inline">Refresh</span>
          </button>

          <button
            type="button"
            className="btn-primary min-h-[var(--touch-min)] gap-2 shadow-sm"
            onClick={openNewCaseModal}
          >
            <Plus size={18} aria-hidden />
            <span>New Lab Case</span>
          </button>
        </div>
      </header>

      {/* Status Announcements */}
      <ConfigStatus loading={loading && !refreshing} error={error} ok={okMessage} />

      {/* 2. KPI Summary Stat Cards */}
      <section aria-label="Laboratory Key Metrics" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <button
          type="button"
          onClick={() => setStatusFilter(statusFilter === "overdue" ? "all" : "overdue")}
          className={`glass-panel relative flex flex-col justify-between overflow-hidden p-3.5 text-left transition-all ${
            statusFilter === "overdue" ? "ring-2 ring-danger" : "hover:border-amber-300"
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted">Overdue Cases</span>
            <AlertTriangle
              size={18}
              className={overdue.length > 0 ? "text-danger animate-pulse" : "text-muted"}
              aria-hidden
            />
          </div>
          <p className={`font-display mt-2 text-2xl font-bold ${overdue.length > 0 ? "text-danger" : "text-ink"}`}>
            {overdue.length}
          </p>
          <p className="mt-1 truncate text-xs text-muted">
            {overdue.length > 0 ? "Click to filter overdue cases" : "All delivery dates on schedule"}
          </p>
        </button>

        <div className="glass-panel relative flex flex-col justify-between overflow-hidden p-3.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted">In Fabrication</span>
            <FlaskConical size={18} className="text-blue-600 dark:text-blue-400" aria-hidden />
          </div>
          <p className="font-display mt-2 text-2xl font-bold text-ink">{activeCasesCount}</p>
          <p className="mt-1 truncate text-xs text-muted">Dispatched or at technician bench</p>
        </div>

        <div className="glass-panel relative flex flex-col justify-between overflow-hidden p-3.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted">Ready to Fit</span>
            <CheckCircle2 size={18} className="text-emerald-600 dark:text-emerald-400" aria-hidden />
          </div>
          <p className="font-display mt-2 text-2xl font-bold text-ink">{readyCasesCount}</p>
          <p className="mt-1 truncate text-xs text-muted">Prosthesis in clinic ready for seating</p>
        </div>

        <div className="glass-panel relative flex flex-col justify-between overflow-hidden p-3.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted">Fitted / Delivered</span>
            <ShieldCheck size={18} className="text-purple-600 dark:text-purple-400" aria-hidden />
          </div>
          <p className="font-display mt-2 text-2xl font-bold text-ink">{fittedCasesCount}</p>
          <p className="mt-1 truncate text-xs text-muted">Delivered & verified restorations</p>
        </div>

        <div className="glass-panel relative flex flex-col justify-between overflow-hidden p-3.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted">Lab Spend</span>
            <Wallet size={18} className="text-brand-600 dark:text-brand-400" aria-hidden />
          </div>
          <p className="font-display mt-2 text-2xl font-bold text-ink">{formatMoney(totalCostActive, currency, locale)}</p>
          <p className="mt-1 truncate text-xs text-muted">Total active laboratory costs</p>
        </div>
      </section>

      {/* 3. Overdue Urgent Alert Banner */}
      {overdue.length > 0 && statusFilter !== "overdue" && (
        <section
          role="alert"
          aria-live="polite"
          className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-300 bg-amber-50/90 p-4 text-sm text-amber-950 shadow-sm dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200"
        >
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700 dark:bg-amber-900/60 dark:text-amber-300">
              <AlertTriangle size={20} aria-hidden />
            </span>
            <div>
              <p className="font-semibold">
                {overdue.length} {overdue.length === 1 ? "case has" : "cases have"} exceeded the expected delivery date
              </p>
              <p className="text-xs text-amber-800 dark:text-amber-300">
                Follow up with dental laboratory partners to prevent patient appointment delays.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setStatusFilter("overdue")}
            className="btn-ghost min-h-[var(--touch-min)] border border-amber-300 bg-white/80 px-3 py-1.5 font-semibold text-amber-900 hover:bg-white dark:border-amber-700 dark:bg-amber-900/40 dark:text-amber-100"
          >
            Review {overdue.length} Overdue {overdue.length === 1 ? "Case" : "Cases"}
          </button>
        </section>
      )}

      {/* 4. Toolbar: Search, Stage Filter Tabs, and View Switcher */}
      <div className="glass-panel flex flex-col gap-3 rounded-2xl p-3 sm:flex-row sm:items-center sm:justify-between">
        {/* Search */}
        <div className="relative flex-1 sm:max-w-xs">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search patient, tooth, lab, type..."
            className="input min-h-[var(--touch-min)] pl-9 text-sm"
            aria-label="Search lab cases"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted hover:text-ink"
              aria-label="Clear search"
            >
              <X size={16} aria-hidden />
            </button>
          )}
        </div>

        {/* Stage Filter Chips (Keyboard navigable) */}
        <div
          role="tablist"
          aria-label="Filter cases by status"
          className="flex flex-wrap items-center gap-1.5 overflow-x-auto py-1"
          onKeyDown={(e) =>
            onTabListKeyDown(
              e,
              ["all", "active", "received", "fitted", "draft", "cancelled", "overdue"] as const,
              statusFilter as any,
              (val) => setStatusFilter(val),
            )
          }
        >
          {filterTabs.map((tab) => {
            const active = statusFilter === tab.id;
            return (
              <button
                key={tab.id}
                role="tab"
                aria-selected={active}
                tabIndex={active ? 0 : -1}
                type="button"
                onClick={() => setStatusFilter(tab.id)}
                className={`flex min-h-[var(--touch-min)] items-center gap-1.5 rounded-xl px-3 text-xs font-semibold transition-all ${
                  active
                    ? "bg-brand-900 text-white shadow-sm dark:bg-brand-600 dark:text-white"
                    : "bg-surface-elevated/70 text-muted hover:bg-surface-elevated hover:text-ink"
                }`}
              >
                <span>{tab.label}</span>
                <span
                  className={`rounded-full px-1.5 py-0.2 text-[10px] font-bold ${
                    active ? "bg-white/20 text-white" : "bg-black/5 text-muted dark:bg-white/10"
                  }`}
                >
                  {tab.count}
                </span>
              </button>
            );
          })}
        </div>

        {/* View Switcher: Board vs Table */}
        <div className="flex items-center rounded-xl bg-surface-elevated/80 p-1 border border-border/40">
          <button
            type="button"
            onClick={() => setViewMode("board")}
            aria-label="Kanban board view"
            aria-pressed={viewMode === "board"}
            className={`flex min-h-[var(--touch-min)] items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition-all ${
              viewMode === "board"
                ? "bg-white text-ink shadow-xs dark:bg-surface dark:text-ink"
                : "text-muted hover:text-ink"
            }`}
          >
            <LayoutGrid size={16} aria-hidden />
            <span className="hidden md:inline">Board</span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode("table")}
            aria-label="Table list view"
            aria-pressed={viewMode === "table"}
            className={`flex min-h-[var(--touch-min)] items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition-all ${
              viewMode === "table"
                ? "bg-white text-ink shadow-xs dark:bg-surface dark:text-ink"
                : "text-muted hover:text-ink"
            }`}
          >
            <List size={16} aria-hidden />
            <span className="hidden md:inline">Table</span>
          </button>
        </div>
      </div>

      {/* 5. Main Content Area */}
      {filteredCases.length === 0 ? (
        <EmptyState
          title={searchQuery || statusFilter !== "all" ? "No matching lab cases" : "No lab cases on file"}
          hint={
            searchQuery || statusFilter !== "all"
              ? "Try adjusting your search criteria or resetting the stage filter."
              : "Create a new lab case to start tracking crown, bridge, or denture fabrications."
          }
          action={
            searchQuery || statusFilter !== "all" ? (
              <button
                type="button"
                className="btn-ghost min-h-[var(--touch-min)]"
                onClick={() => {
                  setSearchQuery("");
                  setStatusFilter("all");
                }}
              >
                Reset filters
              </button>
            ) : (
              <button type="button" className="btn-primary min-h-[var(--touch-min)] gap-2" onClick={openNewCaseModal}>
                <Plus size={18} aria-hidden />
                New Lab Case
              </button>
            )
          }
        />
      ) : viewMode === "board" ? (
        /* Kanban Board View */
        <div className="grid gap-4 lg:grid-cols-4">
          {KANBAN_STAGES.map((colKey) => {
            const meta = STATUS_METADATA[colKey];
            const columnCases = filteredCases.filter((c) => c.status === colKey);

            return (
              <section
                key={colKey}
                aria-label={meta.label}
                className="glass-panel flex flex-col rounded-3xl p-3.5 transition-colors"
              >
                <div className="flex items-center justify-between border-b border-border/30 pb-2.5">
                  <div className="flex items-center gap-2">
                    <span className="font-display text-sm font-bold text-ink">{meta.label}</span>
                    <span className="rounded-full bg-surface-elevated px-2 py-0.5 text-xs font-semibold text-muted">
                      {columnCases.length}
                    </span>
                  </div>
                </div>

                <div className="mt-3 flex-1 space-y-3">
                  {columnCases.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-border/50 p-6 text-center text-xs text-muted">
                      No cases in this stage
                    </div>
                  ) : (
                    columnCases.map((c) => {
                      const p = patientDirectory.get(c.patient_id);
                      const patientName =
                        c.patient_name || (p ? `${p.first_name} ${p.last_name}` : `Patient #${c.patient_id.slice(0, 8)}`);
                      const patientCode = c.patient_code || p?.patient_code;
                      const isOverdue = c.is_overdue || overdueIdSet.has(c.id);

                      return (
                        <article
                          key={c.id}
                          className={`group relative flex flex-col justify-between rounded-2xl border p-4 shadow-xs transition-all hover:shadow-md ${
                            isOverdue
                              ? "border-amber-300 bg-amber-50/60 dark:border-amber-800 dark:bg-amber-950/20"
                              : "border-border/60 bg-surface-elevated hover:border-brand-300 dark:bg-surface-elevated/80"
                          }`}
                        >
                          {/* Card Header: Patient Identity */}
                          <div>
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <Link
                                  to={`/patients/${c.patient_id}`}
                                  className="group/link flex items-center gap-1.5 font-semibold text-ink hover:text-brand-700"
                                  title={`View clinical chart for ${patientName}`}
                                >
                                  <span className="truncate">{patientName}</span>
                                  <ExternalLink
                                    size={13}
                                    className="shrink-0 opacity-0 transition-opacity group-hover/link:opacity-100"
                                    aria-hidden
                                  />
                                </Link>
                                {patientCode && (
                                  <span className="text-[11px] font-mono text-muted">{patientCode}</span>
                                )}
                              </div>

                              {isOverdue && (
                                <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-red-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-red-700 dark:bg-red-950/60 dark:text-red-300">
                                  <AlertTriangle size={11} aria-hidden />
                                  Overdue
                                </span>
                              )}
                            </div>

                            {/* Prosthetic Details */}
                            <div className="mt-2.5 flex flex-wrap items-center gap-1.5 text-xs">
                              <span className="inline-flex items-center rounded-lg bg-brand-50 px-2 py-0.5 font-semibold text-brand-900 dark:bg-brand-950/50 dark:text-brand-300">
                                {c.case_type}
                              </span>
                              {c.tooth && (
                                <span className="inline-flex items-center rounded-lg bg-surface px-2 py-0.5 font-medium text-ink border border-border/50">
                                  Tooth {c.tooth}
                                </span>
                              )}
                              {c.shade && (
                                <span className="inline-flex items-center rounded-lg bg-surface px-2 py-0.5 font-medium text-muted border border-border/50">
                                  {c.shade}
                                </span>
                              )}
                            </div>

                            {/* Lab Partner & Due Date */}
                            <div className="mt-2.5 space-y-1 text-xs text-muted">
                              {c.lab_name && (
                                <div className="flex items-center gap-1.5">
                                  <Building2 size={13} className="shrink-0 text-muted" aria-hidden />
                                  <span className="truncate">{c.lab_name}</span>
                                </div>
                              )}
                              {c.due_at && (
                                <div
                                  className={`flex items-center gap-1.5 ${
                                    isOverdue ? "font-semibold text-danger" : "text-muted"
                                  }`}
                                >
                                  <Calendar size={13} className="shrink-0" aria-hidden />
                                  <span>Due: {formatDateSafe(c.due_at, "MMM d, yyyy")}</span>
                                </div>
                              )}
                              {c.restoration_id && (
                                <div className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400">
                                  <CheckCircle2 size={13} className="shrink-0" aria-hidden />
                                  <span>Linked to chart restoration</span>
                                </div>
                              )}
                            </div>

                            {/* Clinical Notes snippet */}
                            {c.notes && (
                              <p className="mt-2 line-clamp-2 rounded-lg bg-surface/60 p-2 text-xs italic text-muted">
                                "{c.notes}"
                              </p>
                            )}
                          </div>

                          {/* Card Footer: Status Actions */}
                          <div className="mt-4 border-t border-border/40 pt-3">
                            <div className="flex items-center justify-between gap-2">
                              {/* Next Stage Advance CTA */}
                              {meta.nextStatus ? (
                                meta.nextStatus === "fitted" ? (
                                  <ConfirmAction
                                    label="Seat & Cement"
                                    confirmLabel="Confirm Fitting"
                                    variant="primary"
                                    className="flex-1 min-h-[var(--touch-min)] text-xs font-semibold"
                                    onConfirm={() => updateStatus(c.id, "fitted")}
                                  />
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => updateStatus(c.id, meta.nextStatus!)}
                                    className="btn-primary flex-1 min-h-[var(--touch-min)] text-xs font-semibold"
                                  >
                                    {meta.nextLabel}
                                  </button>
                                )
                              ) : (
                                <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                                  <ShieldCheck size={16} aria-hidden />
                                  Completed
                                </span>
                              )}

                              {/* Direct Status Selector Menu */}
                              <label className="sr-only" htmlFor={`status-select-${c.id}`}>
                                Change case status
                              </label>
                              <select
                                id={`status-select-${c.id}`}
                                value={c.status}
                                onChange={(e) => updateStatus(c.id, e.target.value)}
                                className="input min-h-[var(--touch-min)] w-auto max-w-[110px] px-2 py-1 text-xs"
                              >
                                {ALL_STATUSES.map((s) => (
                                  <option key={s} value={s}>
                                    {STATUS_METADATA[s]?.label || s}
                                  </option>
                                ))}
                              </select>
                            </div>
                          </div>
                        </article>
                      );
                    })
                  )}
                </div>
              </section>
            );
          })}
        </div>
      ) : (
        /* Tabular List View */
        <section aria-label="Laboratory Cases Table" className="glass-panel overflow-hidden rounded-3xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border/40 bg-surface-elevated/40 text-xs font-semibold uppercase tracking-wider text-muted">
                <tr>
                  <th scope="col" className="px-4 py-3.5">
                    Patient
                  </th>
                  <th scope="col" className="px-4 py-3.5">
                    Prosthesis / Tooth
                  </th>
                  <th scope="col" className="px-4 py-3.5">
                    Laboratory
                  </th>
                  <th scope="col" className="px-4 py-3.5">
                    Stage
                  </th>
                  <th scope="col" className="px-4 py-3.5">
                    Due Date
                  </th>
                  <th scope="col" className="px-4 py-3.5 text-right">
                    Cost
                  </th>
                  <th scope="col" className="px-4 py-3.5 text-right">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/20">
                {filteredCases.map((c) => {
                  const p = patientDirectory.get(c.patient_id);
                  const patientName =
                    c.patient_name || (p ? `${p.first_name} ${p.last_name}` : `Patient #${c.patient_id.slice(0, 8)}`);
                  const patientCode = c.patient_code || p?.patient_code;
                  const isOverdue = c.is_overdue || overdueIdSet.has(c.id);
                  const stMeta = STATUS_METADATA[c.status] || STATUS_METADATA.draft;

                  return (
                    <tr
                      key={c.id}
                      className={`transition-colors hover:bg-surface-elevated/50 ${
                        isOverdue ? "bg-amber-50/40 dark:bg-amber-950/20" : ""
                      }`}
                    >
                      {/* Patient */}
                      <td className="px-4 py-3">
                        <Link
                          to={`/patients/${c.patient_id}`}
                          className="font-semibold text-ink hover:text-brand-700"
                        >
                          {patientName}
                        </Link>
                        {patientCode && <div className="text-xs font-mono text-muted">{patientCode}</div>}
                      </td>

                      {/* Prosthesis & Tooth */}
                      <td className="px-4 py-3">
                        <div className="font-medium text-ink">{c.case_type}</div>
                        <div className="flex items-center gap-2 text-xs text-muted">
                          {c.tooth && <span>Tooth {c.tooth}</span>}
                          {c.shade && <span>· Shade {c.shade}</span>}
                          {c.restoration_id && <span className="text-emerald-700 dark:text-emerald-400">· Linked</span>}
                        </div>
                      </td>

                      {/* Laboratory */}
                      <td className="px-4 py-3 text-muted">{c.lab_name || "—"}</td>

                      {/* Status */}
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center rounded-lg border px-2.5 py-1 text-xs font-semibold ${stMeta.badge}`}
                        >
                          {stMeta.label}
                        </span>
                      </td>

                      {/* Due Date */}
                      <td className="px-4 py-3">
                        {c.due_at ? (
                          <div className={isOverdue ? "font-semibold text-danger" : "text-muted"}>
                            {formatDateSafe(c.due_at, "MMM d, yyyy")}
                            {isOverdue && <span className="ml-1 text-[11px] uppercase font-bold">(Overdue)</span>}
                          </div>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>

                      {/* Cost */}
                      <td className="px-4 py-3 text-right font-mono font-medium">
                        {formatMoney(c.lab_cost || 0, currency, locale)}
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {stMeta.nextStatus && (
                            stMeta.nextStatus === "fitted" ? (
                              <ConfirmAction
                                label="Seat & Cement"
                                confirmLabel="Confirm Fitting"
                                variant="primary"
                                className="min-h-[var(--touch-min)] text-xs"
                                onConfirm={() => updateStatus(c.id, "fitted")}
                              />
                            ) : (
                              <button
                                type="button"
                                onClick={() => updateStatus(c.id, stMeta.nextStatus!)}
                                className="btn-primary min-h-[var(--touch-min)] px-3 text-xs"
                              >
                                {stMeta.nextLabel}
                              </button>
                            )
                          )}

                          <label className="sr-only" htmlFor={`tbl-status-${c.id}`}>
                            Change status for case {c.id}
                          </label>
                          <select
                            id={`tbl-status-${c.id}`}
                            value={c.status}
                            onChange={(e) => updateStatus(c.id, e.target.value)}
                            className="input min-h-[var(--touch-min)] w-auto px-2 py-1 text-xs"
                          >
                            {ALL_STATUSES.map((s) => (
                              <option key={s} value={s}>
                                {STATUS_METADATA[s]?.label || s}
                              </option>
                            ))}
                          </select>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* 6. Modal: Create New Lab Case */}
      {modalOpen && (
        <Modal
          title="New Dental Laboratory Case"
          subtitle="Record prescription details, connect restorative chart items, and dispatch fabrication orders."
          size="wide"
          onClose={() => !submitting && setModalOpen(false)}
        >
          <form onSubmit={handleCreateCase} className="space-y-5">
            {/* Patient Search and Selection */}
            <div className="relative">
              <ConfigField
                label="Patient"
                hint="Search by patient name or file code to assign this laboratory work."
              >
                <div className="relative">
                  <input
                    type="text"
                    required
                    value={patientQuery}
                    onChange={(e) => {
                      setPatientQuery(e.target.value);
                      setSelectedPatient(null);
                    }}
                    placeholder="Search patient by name or code..."
                    className="input min-h-[var(--touch-min)] text-sm"
                  />
                  {patientHits.length > 0 && (
                    <ul
                      role="listbox"
                      className="absolute left-0 right-0 top-full z-20 mt-1 max-h-48 overflow-y-auto rounded-xl border border-border bg-surface p-1 shadow-lg"
                    >
                      {patientHits.map((p) => (
                        <li key={p.id}>
                          <button
                            type="button"
                            onClick={() => void handlePatientSelect(p)}
                            className="flex w-full min-h-[var(--touch-min)] items-center justify-between rounded-lg px-3 py-2 text-left text-sm hover:bg-surface-elevated"
                          >
                            <span className="font-semibold text-ink">
                              {p.first_name} {p.last_name}
                            </span>
                            <span className="font-mono text-xs text-muted">{p.patient_code}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </ConfigField>
            </div>

            {/* Linked Restoration (Optional auto-fill) */}
            {patientRestorations.length > 0 && (
              <ConfigField
                label="Link Chairside Restoration"
                hint="Selecting an active clinical restoration automatically links the chart entry."
              >
                <select
                  value={selectedRestorationId}
                  onChange={(e) => handleRestorationSelect(e.target.value)}
                  className="input min-h-[var(--touch-min)] text-sm"
                >
                  <option value="">None (Standalone laboratory case)</option>
                  {patientRestorations.map((r) => (
                    <option key={r.id} value={r.id}>
                      Tooth {r.tooth_number} · {r.restoration_type} ({r.status})
                    </option>
                  ))}
                </select>
              </ConfigField>
            )}

            {/* Case Type & Tooth */}
            <div className="grid gap-4 sm:grid-cols-2">
              <ConfigField label="Prosthesis / Case Type" hint="Type of laboratory prosthetic being manufactured.">
                <input
                  type="text"
                  required
                  list="case-type-presets"
                  value={formData.case_type}
                  onChange={(e) => setFormData({ ...formData, case_type: e.target.value })}
                  placeholder="e.g. Crown (Zirconia)"
                  className="input min-h-[var(--touch-min)] text-sm"
                />
                <datalist id="case-type-presets">
                  {CASE_TYPE_PRESETS.map((t) => (
                    <option key={t} value={t} />
                  ))}
                </datalist>
              </ConfigField>

              <ConfigField label="Tooth Number(s)" hint="FDI notation (e.g. 16, 21, or 35-37 for bridge).">
                <input
                  type="text"
                  value={formData.tooth}
                  onChange={(e) => setFormData({ ...formData, tooth: e.target.value })}
                  placeholder="e.g. 16 or 21"
                  className="input min-h-[var(--touch-min)] text-sm"
                />
              </ConfigField>
            </div>

            {/* Shade & Laboratory Partner */}
            <div className="grid gap-4 sm:grid-cols-2">
              <ConfigField label="Shade" hint="VITA classical or custom bleach shade.">
                <input
                  type="text"
                  list="shade-presets"
                  value={formData.shade}
                  onChange={(e) => setFormData({ ...formData, shade: e.target.value })}
                  placeholder="e.g. A2"
                  className="input min-h-[var(--touch-min)] text-sm"
                />
                <datalist id="shade-presets">
                  {SHADE_PRESETS.map((s) => (
                    <option key={s} value={s} />
                  ))}
                </datalist>
              </ConfigField>

              <ConfigField label="Laboratory Partner" hint="Commercial or internal laboratory facility.">
                <input
                  type="text"
                  list="lab-presets"
                  value={formData.lab_name}
                  onChange={(e) => setFormData({ ...formData, lab_name: e.target.value })}
                  placeholder="e.g. SmileLab Pro"
                  className="input min-h-[var(--touch-min)] text-sm"
                />
                <datalist id="lab-presets">
                  {LAB_PARTNERS.map((l) => (
                    <option key={l} value={l} />
                  ))}
                </datalist>
              </ConfigField>
            </div>

            {/* Expected Due Date & Estimated Cost */}
            <div className="grid gap-4 sm:grid-cols-2">
              <ConfigField label="Target Due Date" hint="Expected delivery date back to clinic.">
                <div className="flex items-center gap-2">
                  <input
                    type="datetime-local"
                    value={formData.due_at}
                    onChange={(e) => setFormData({ ...formData, due_at: e.target.value })}
                    className="input min-h-[var(--touch-min)] text-sm flex-1"
                  />
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, due_at: getSuggestedDueDate(7) })}
                    className="btn-ghost min-h-[var(--touch-min)] px-2.5 text-xs text-muted hover:text-ink whitespace-nowrap"
                    title="Set to 7 days from now"
                  >
                    +7 Days
                  </button>
                </div>
              </ConfigField>

              <ConfigField label="Laboratory Cost" hint={`Estimated invoice amount from laboratory in ${currency}.`}>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 font-mono text-xs text-muted">
                    {currency}
                  </span>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={formData.lab_cost || ""}
                    onChange={(e) => setFormData({ ...formData, lab_cost: Number(e.target.value) || 0 })}
                    placeholder="0"
                    className="input min-h-[var(--touch-min)] pl-12 font-mono text-sm"
                  />
                </div>
              </ConfigField>
            </div>

            {/* Initial Stage & Technician Notes */}
            <ConfigField label="Initial Case Status" hint="Current stage of this prescription.">
              <select
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                className="input min-h-[var(--touch-min)] text-sm"
              >
                <option value="sent">Sent to Lab (Dispatched)</option>
                <option value="draft">Draft (Scan/Impression held in clinic)</option>
                <option value="in_progress">In Fabrication</option>
                <option value="received">Ready / Received</option>
              </select>
            </ConfigField>

            <ConfigField
              label="Technician Clinical Instructions"
              hint="Occlusion clearance, margin design, contact tightness, or characterization notes."
            >
              <textarea
                rows={3}
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder="e.g. Light occlusion, tight distal contact, subgingival buccal margin..."
                className="input text-sm resize-y"
              />
            </ConfigField>

            {/* Actions */}
            <div className="flex items-center justify-end gap-3 border-t border-border/40 pt-4">
              <button
                type="button"
                className="btn-ghost min-h-[var(--touch-min)] px-4 text-sm"
                onClick={() => setModalOpen(false)}
                disabled={submitting}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn-primary min-h-[var(--touch-min)] px-5 text-sm font-semibold"
                disabled={submitting}
              >
                {submitting ? "Creating Case…" : "Create Lab Case"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
