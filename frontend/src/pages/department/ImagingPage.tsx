import { FormEvent, KeyboardEvent, useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { format, isValid, parseISO } from "date-fns";
import { ImageOff, Lock } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { Modal } from "@/components/Modal";
import { DentalArchFilter } from "@/components/viz/DentalArchFilter";
import { CompareViewer, ImageViewer } from "@/components/viz/ImageViewer";
import { VolumeWorkspace } from "@/components/viz/VolumeWorkspace";
import { useAnnounce } from "@/components/ui/sonner";
import { api, apiUpload, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { StatGrid, useDepartmentHome } from "./FrontClinicalPages";

type Study = {
  id: string;
  patient_id: string;
  study_type: string;
  tooth?: string | null;
  storage_key?: string | null;
  notes?: string | null;
  captured_at: string;
  has_content?: boolean;
  content_type?: string | null;
  byte_size?: number | null;
  is_encrypted?: boolean;
  original_filename?: string | null;
};

type Patient = { id: string; first_name: string; last_name: string; patient_code: string };

type Guard =
  | { type: "close-preview" }
  | { type: "open-study"; study: Study; mpr: boolean }
  | { type: "patient"; patientId: string }
  | { type: "clear-compare" };

const MODALITIES = [
  { value: "PA", label: "Periapical (PA)" },
  { value: "BW", label: "Bitewing (BW)" },
  { value: "OPG", label: "Panoramic (OPG)" },
  { value: "CBCT", label: "Cone beam (CBCT)" },
  { value: "photo", label: "Photo" },
] as const;

const alertClass =
  "rounded-2xl border border-[var(--err-bd)] bg-[var(--err-bg)] px-4 py-3 text-sm text-[var(--err-fg)]";
const okClass =
  "rounded-2xl border border-[var(--ok-bd)] bg-[var(--ok-bg)] px-4 py-3 text-sm text-[var(--ok-fg)]";

function messageOf(err: unknown, fallback: string) {
  if (err instanceof ApiError && err.message) return err.message;
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

function formatWhen(value: string) {
  try {
    const d = parseISO(value);
    return isValid(d) ? format(d, "MMM d, yyyy HH:mm") : value;
  } catch {
    return value;
  }
}

function modalityLabel(code: string) {
  return MODALITIES.find((m) => m.value === code)?.label ?? code;
}

function patientName(patient: Patient) {
  return `${patient.patient_code} · ${patient.first_name} ${patient.last_name}`;
}

export function ImagingPage() {
  const { home, error: homeError } = useDepartmentHome();
  const accessToken = useAuth((s) => s.accessToken);
  const [params] = useSearchParams();
  const linkedPatient = params.get("patient") || "";
  const linkedTooth = params.get("tooth") || "";
  const [studies, setStudies] = useState<Study[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [searchHits, setSearchHits] = useState<Patient[] | null>(null);
  const [patientQuery, setPatientQuery] = useState("");
  const [patientSearchNote, setPatientSearchNote] = useState("");
  const [preview, setPreview] = useState<{ id: string; url: string; study: Study } | null>(null);
  const [compare, setCompare] = useState<{ id: string; url: string; label: string }[]>([]);
  const [mprOpen, setMprOpen] = useState(false);
  const [mprStudyId, setMprStudyId] = useState<string | null>(null);
  const [toothFilter, setToothFilter] = useState<string[]>(linkedTooth ? [linkedTooth] : []);
  const [modality, setModality] = useState("");
  const [studyQuery, setStudyQuery] = useState("");
  const [form, setForm] = useState({
    patient_id: linkedPatient,
    study_type: "PA",
    tooth: linkedTooth,
    notes: "",
    file: null as File | null,
  });
  const [formOpen, setFormOpen] = useState(() => Boolean(linkedPatient || linkedTooth));
  const [fileKey, setFileKey] = useState(0);
  const [listBusy, setListBusy] = useState(true);
  const [loadedOnce, setLoadedOnce] = useState(false);
  const [listError, setListError] = useState("");
  const [actionError, setActionError] = useState("");
  const [ok, setOk] = useState("");
  const [saving, setSaving] = useState(false);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [uploadRetry, setUploadRetry] = useState<{ studyId: string; file: File } | null>(null);
  const [markCount, setMarkCount] = useState(0);
  const [compareMarks, setCompareMarks] = useState(0);
  const [guard, setGuard] = useState<Guard | null>(null);
  const savingRef = useRef(false);
  const openingRef = useRef<string | null>(null);
  const guardReturn = useRef<HTMLElement | null>(null);
  const keepRef = useRef<HTMLButtonElement | null>(null);
  const previewUrlRef = useRef<string | null>(null);
  const compareUrlsRef = useRef<string[]>([]);
  const ids = useId();
  const patientSearchId = `${ids}-patient-search`;
  const patientSelectId = `${ids}-patient`;
  const studySearchId = `${ids}-study-search`;
  const studyTypeId = `${ids}-study-type`;
  const toothId = `${ids}-tooth`;
  const toothHintId = `${ids}-tooth-hint`;
  const notesId = `${ids}-notes`;
  const fileId = `${ids}-file`;
  const fileHintId = `${ids}-file-hint`;
  savingRef.current = saving;
  previewUrlRef.current = preview?.url ?? null;
  compareUrlsRef.current = compare.map((item) => item.url);

  const toastMessage =
    actionError ||
    listError ||
    ok ||
    (homeError ? "Clinic snapshot failed to load. Imaging studies are not affected." : "");
  useAnnounce(toastMessage);

  const load = useCallback(async () => {
    setListBusy(true);
    try {
      const [s, p] = await Promise.all([
        api<Study[]>("/api/v1/imaging/studies"),
        api<{ items: Patient[] }>("/api/v1/patients?limit=100"),
      ]);
      let items = p.items;
      if (linkedPatient && !items.some((item) => item.id === linkedPatient)) {
        try {
          const one = await api<Patient>(`/api/v1/patients/${linkedPatient}`);
          items = [one, ...items];
        } catch {
          /* The link id is still kept on the form when the patient record cannot be read. */
        }
      }
      setStudies(s);
      setPatients(items);
      setForm((current) => {
        if (current.patient_id || !items[0]) return current;
        return { ...current, patient_id: items[0].id };
      });
      setLoadedOnce(true);
      setListError("");
    } catch {
      setListError("Could not load imaging studies. Nothing on screen was changed. Reload studies to try again.");
    } finally {
      setListBusy(false);
    }
  }, [linkedPatient]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    return () => {
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
      compareUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    };
  }, []);

  useEffect(() => {
    const q = patientQuery.trim();
    if (q.length < 2) {
      setSearchHits(null);
      setPatientSearchNote("");
      return;
    }
    let cancel = false;
    const timer = window.setTimeout(() => {
      api<{ items: Patient[] }>(`/api/v1/patients?limit=20&q=${encodeURIComponent(q)}`)
        .then((res) => {
          if (cancel) return;
          setSearchHits(res.items);
          setPatientSearchNote(
            res.items.length === 0
              ? "No patients match that name or code. The selected patient stays selected."
              : "",
          );
        })
        .catch(() => {
          if (cancel) return;
          setSearchHits(null);
          setPatientSearchNote("Patient search failed. Showing the patients already loaded. Try the name again.");
        });
    }, 300);
    return () => {
      cancel = true;
      window.clearTimeout(timer);
    };
  }, [patientQuery]);

  useEffect(() => {
    if (guard) keepRef.current?.focus();
  }, [guard]);

  const selectedPatient =
    patients.find((p) => p.id === form.patient_id) ??
    searchHits?.find((p) => p.id === form.patient_id) ??
    null;
  const patientLabel = selectedPatient ? patientName(selectedPatient) : "";

  const shownPatients = useMemo(() => {
    const q = patientQuery.trim().toLowerCase();
    let base = patients;
    if (q.length >= 2 && searchHits) base = searchHits;
    else if (q.length === 1) {
      base = patients.filter((p) =>
        `${p.patient_code} ${p.first_name} ${p.last_name}`.toLowerCase().includes(q),
      );
    }
    if (selectedPatient && !base.some((p) => p.id === selectedPatient.id)) return [selectedPatient, ...base];
    return base;
  }, [patients, searchHits, patientQuery, selectedPatient]);

  const scoped = useMemo(() => {
    const pid = form.patient_id;
    return studies.filter((s) => !pid || s.patient_id === pid);
  }, [studies, form.patient_id]);

  const availableTeeth = useMemo(
    () => new Set(scoped.map((s) => s.tooth).filter((t): t is string => Boolean(t))),
    [scoped],
  );

  const visible = useMemo(() => {
    const q = studyQuery.trim().toLowerCase();
    return scoped.filter((s) => {
      if (modality && s.study_type !== modality) return false;
      if (toothFilter.length && (!s.tooth || !toothFilter.includes(s.tooth))) return false;
      if (!q) return true;
      const hay = [s.study_type, modalityLabel(s.study_type), s.tooth, s.notes, s.original_filename, s.captured_at, formatWhen(s.captured_at)]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [scoped, modality, toothFilter, studyQuery]);

  const filtersOn = Boolean(modality || toothFilter.length || studyQuery.trim());

  const context =
    listBusy && !loadedOnce
      ? "Loading imaging studies."
      : patientLabel
        ? `${patientLabel}. ${visible.length} of ${scoped.length} studies shown.`
        : loadedOnce
          ? "Select a patient to see their imaging studies."
          : "Imaging studies did not load.";

  function arm(next: Guard) {
    guardReturn.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setGuard(next);
  }

  function dismissGuard() {
    setGuard(null);
    const back = guardReturn.current;
    queueMicrotask(() => {
      if (back && document.contains(back)) back.focus();
      else document.getElementById("register-study-trigger")?.focus();
    });
  }

  function clearFilters() {
    setModality("");
    setToothFilter([]);
    setStudyQuery("");
  }

  function closePreview() {
    if (preview?.url) URL.revokeObjectURL(preview.url);
    setPreview(null);
    setMprOpen(false);
    setMarkCount(0);
  }

  function clearCompare() {
    compare.forEach((item) => URL.revokeObjectURL(item.url));
    setCompare([]);
    setCompareMarks(0);
  }

  function applyPatient(patientId: string) {
    const picked =
      patients.find((p) => p.id === patientId) ?? searchHits?.find((p) => p.id === patientId) ?? null;
    if (picked && !patients.some((p) => p.id === picked.id)) {
      setPatients((current) => [picked, ...current]);
    }
    setForm((current) => ({ ...current, patient_id: patientId }));
    setToothFilter([]);
    if (preview && preview.study.patient_id !== patientId) {
      URL.revokeObjectURL(preview.url);
      setPreview(null);
      setMarkCount(0);
      setMprOpen(false);
    }
    const nextCompare: { id: string; url: string; label: string }[] = [];
    let dropped = false;
    for (const item of compare) {
      const study = studies.find((s) => s.id === item.id);
      if (study && study.patient_id !== patientId) {
        URL.revokeObjectURL(item.url);
        dropped = true;
      } else nextCompare.push(item);
    }
    if (dropped) {
      setCompare(nextCompare);
      setCompareMarks(0);
    }
  }

  function requestPatient(patientId: string) {
    if (patientId === form.patient_id) return;
    const willClosePreview = Boolean(preview && preview.study.patient_id !== patientId);
    const willCloseCompare = compare.some((item) => {
      const study = studies.find((s) => s.id === item.id);
      return !study || study.patient_id !== patientId;
    });
    if ((willClosePreview && markCount > 0) || (willCloseCompare && compareMarks > 0)) {
      arm({ type: "patient", patientId });
      return;
    }
    applyPatient(patientId);
  }

  async function uploadFile(studyId: string, file: File) {
    const fd = new FormData();
    fd.append("file", file);
    await apiUpload(`/api/v1/imaging/studies/${studyId}/upload`, fd);
  }

  async function fetchStudyUrl(study: Study): Promise<string | null> {
    if (!study.has_content) return null;
    const apiBase = import.meta.env.VITE_API_BASE ?? "";
    const res = await fetch(`${apiBase}/api/v1/imaging/studies/${study.id}/content`, {
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
    });
    if (!res.ok) {
      setActionError("Could not open the image. The study on file was not changed. Try View again.");
      return null;
    }
    return URL.createObjectURL(await res.blob());
  }

  async function showStudy(study: Study, opts?: { mpr?: boolean }) {
    setActionError("");
    if (!study.has_content) {
      if (opts?.mpr) {
        setMprStudyId(study.id);
        setMprOpen(true);
      }
      return;
    }
    if (preview?.id === study.id) {
      if (opts?.mpr || study.study_type === "CBCT") {
        setMprOpen(true);
        setMprStudyId(study.id);
      } else {
        setMprOpen(false);
      }
      return;
    }
    if (openingRef.current) return;
    openingRef.current = study.id;
    setOpeningId(study.id);
    try {
      const url = await fetchStudyUrl(study);
      if (!url) return;
      if (preview?.url) URL.revokeObjectURL(preview.url);
      setPreview({ id: study.id, url, study });
      setMarkCount(0);
      if (opts?.mpr || study.study_type === "CBCT") {
        setMprOpen(true);
        setMprStudyId(study.id);
      } else {
        setMprOpen(false);
      }
    } finally {
      openingRef.current = null;
      setOpeningId(null);
    }
  }

  function requestOpen(study: Study, mpr: boolean) {
    if (markCount > 0 && preview && preview.id !== study.id && study.has_content) {
      arm({ type: "open-study", study, mpr });
      return;
    }
    void showStudy(study, { mpr });
  }

  function requestClosePreview() {
    if (markCount > 0) {
      arm({ type: "close-preview" });
      return;
    }
    closePreview();
  }

  function requestClearCompare() {
    if (compareMarks > 0) {
      arm({ type: "clear-compare" });
      return;
    }
    clearCompare();
  }

  function confirmGuard() {
    const current = guard;
    setGuard(null);
    if (!current) return;
    if (current.type === "close-preview") closePreview();
    else if (current.type === "open-study") void showStudy(current.study, { mpr: current.mpr });
    else if (current.type === "patient") applyPatient(current.patientId);
    else clearCompare();
    queueMicrotask(() => document.getElementById("register-study-trigger")?.focus());
  }

  async function addToCompare(study: Study) {
    if (compare.some((item) => item.id === study.id) || openingRef.current) return;
    setActionError("");
    openingRef.current = study.id;
    setOpeningId(study.id);
    try {
      const url = await fetchStudyUrl(study);
      if (!url) return;
      const label = `${modalityLabel(study.study_type)}${study.tooth ? ` · ${study.tooth}` : ""} · ${formatWhen(study.captured_at)}`;
      setCompare((prev) => {
        const next = [...prev, { id: study.id, url, label }];
        while (next.length > 2) {
          const dropped = next.shift();
          if (dropped) URL.revokeObjectURL(dropped.url);
        }
        return next;
      });
    } finally {
      openingRef.current = null;
      setOpeningId(null);
    }
  }

  const closeForm = useCallback(() => {
    if (savingRef.current) return;
    setFormOpen(false);
  }, []);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    if (!form.patient_id) {
      setActionError("Could not register a study because no patient is selected. Nothing was saved.");
      return;
    }
    setSaving(true);
    setActionError("");
    setOk("");
    try {
      const study = await api<Study>("/api/v1/imaging/studies", {
        method: "POST",
        body: JSON.stringify({
          patient_id: form.patient_id,
          study_type: form.study_type,
          tooth: form.tooth || null,
          notes: form.notes || null,
        }),
      });
      if (form.file) {
        try {
          await uploadFile(study.id, form.file);
        } catch {
          await load();
          setUploadRetry({ studyId: study.id, file: form.file });
          setActionError(
            "Image upload failed. The study was saved without a file and is in the list. Retry the upload. Do not register it again.",
          );
          setFormOpen(false);
          return;
        }
      }
      const who = patientLabel || "the selected patient";
      const what = modalityLabel(form.study_type);
      setUploadRetry(null);
      setOk(`${what} registered for ${who}.`);
      setForm((current) => ({ ...current, notes: "", tooth: "", file: null }));
      setFileKey((key) => key + 1);
      setFormOpen(false);
      await load();
    } catch (err) {
      setActionError(
        `Could not register the study. ${messageOf(err, "Try again.")} Nothing was saved. Check the patient and try again.`,
      );
    } finally {
      setSaving(false);
    }
  }

  async function retryUpload() {
    if (!uploadRetry) return;
    setSaving(true);
    setActionError("");
    setOk("");
    try {
      await uploadFile(uploadRetry.studyId, uploadRetry.file);
      const who = patientLabel || "the selected patient";
      setUploadRetry(null);
      setOk(`Image uploaded for ${who}.`);
      setForm((current) => ({ ...current, notes: "", tooth: "", file: null }));
      setFileKey((key) => key + 1);
      await load();
    } catch {
      setActionError("Image upload failed again. The study is still saved without a file. Retry the upload.");
    } finally {
      setSaving(false);
    }
  }

  function onModalityKey(e: KeyboardEvent<HTMLDivElement>) {
    const idsForKeys = ["", ...MODALITIES.map((m) => m.value)];
    const index = idsForKeys.indexOf(modality);
    if (index < 0) return;
    let next = index;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") next = (index + 1) % idsForKeys.length;
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = (index - 1 + idsForKeys.length) % idsForKeys.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = idsForKeys.length - 1;
    else return;
    e.preventDefault();
    const value = idsForKeys[next] ?? "";
    setModality(value);
    queueMicrotask(() => document.getElementById(value ? `mod-${value}` : "mod-all")?.focus());
  }

  const guardCopy = !guard
    ? null
    : guard.type === "close-preview"
      ? {
          message:
            "Close this review? Marks on the image will leave the screen. They are not saved on the study.",
          confirm: "Close review",
          cancel: "Keep review",
        }
      : guard.type === "open-study"
        ? {
            message:
              "Open the other study? Marks on the current image will leave the screen. They are not saved on the study.",
            confirm: "Open study",
            cancel: "Keep this image",
          }
        : guard.type === "patient"
          ? {
              message:
                "Change patient? Open images will close, and marks on screen will be removed. Studies stored for each patient stay on file.",
              confirm: "Change patient",
              cancel: "Keep this patient",
            }
          : {
              message:
                "Clear the compare view? Marks on the compared images will leave the screen. They are not saved on the studies.",
              confirm: "Clear compare",
              cancel: "Keep compare",
            };

  const headerPrimary = !loadedOnce && listError
    ? { label: listBusy ? "Reloading…" : "Reload studies", action: () => void load(), disabled: listBusy }
    : uploadRetry
      ? { label: saving ? "Uploading…" : "Retry image upload", action: () => void retryUpload(), disabled: saving }
      : {
          label: "Register study",
          action: () => setFormOpen(true),
          disabled: !form.patient_id || (listBusy && !loadedOnce),
        };

  return (
    <div className="animate-rise min-w-0 space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-bold text-brand-900">Imaging suite</h1>
          <p className="mt-1 text-sm text-muted" aria-live="polite">
            {context}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            id="register-study-trigger"
            type="button"
            className="btn-primary"
            disabled={headerPrimary.disabled}
            onClick={headerPrimary.action}
          >
            {headerPrimary.label}
          </button>
          {uploadRetry && (
            <button type="button" className="btn-ghost" onClick={() => setFormOpen(true)}>
              Register another study
            </button>
          )}
        </div>
      </header>

      {homeError && (
        <div role="alert" className={alertClass}>
          Clinic snapshot failed to load. Imaging studies are not affected.
        </div>
      )}
      {ok && (
        <p role="status" aria-live="polite" className={okClass}>
          {ok}
        </p>
      )}
      {actionError && (
        <div role="alert" className={alertClass}>
          {actionError}
        </div>
      )}
      {guardCopy && (
        <div
          role="group"
          aria-label="Confirm"
          className="rounded-2xl border border-brand-100 bg-canvas p-4"
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              dismissGuard();
            }
          }}
        >
          <p className="text-sm text-ink">{guardCopy.message}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button ref={keepRef} type="button" className="btn-primary" onClick={dismissGuard}>
              {guardCopy.cancel}
            </button>
            <button type="button" className="btn-ghost text-danger" onClick={confirmGuard}>
              {guardCopy.confirm}
            </button>
          </div>
        </div>
      )}

      <section className="glass-panel space-y-4 rounded-3xl p-4" aria-busy={listBusy} aria-labelledby="imaging-studies-heading">
        <h2 id="imaging-studies-heading" className="font-display text-lg font-bold text-brand-900">
          Patient studies
        </h2>
        {listBusy && !loadedOnce && (
          <p className="text-sm text-muted" role="status">
            Loading imaging studies…
          </p>
        )}
        {listError && !loadedOnce && (
          <div role="alert" className={alertClass}>
            <p>{listError}</p>
          </div>
        )}
        {listBusy && loadedOnce && (
          <p className="text-sm text-muted" role="status">
            Updating studies…
          </p>
        )}
        {loadedOnce && (
          <>
            {listError && (
              <div role="alert" className={alertClass}>
                <p>{listError}</p>
                <button type="button" className="btn-ghost mt-3" disabled={listBusy} onClick={() => void load()}>
                  {listBusy ? "Reloading…" : "Reload studies"}
                </button>
              </div>
            )}
            <div className="grid gap-4 md:grid-cols-2">
              <label htmlFor={patientSearchId} className="text-sm">
                <span className="label">Find patient</span>
                <input
                  id={patientSearchId}
                  className="input"
                  type="search"
                  autoComplete="off"
                  value={patientQuery}
                  onChange={(e) => setPatientQuery(e.target.value)}
                />
              </label>
              <label htmlFor={patientSelectId} className="text-sm">
                <span className="label">
                  Patient <span className="font-normal text-muted">(required)</span>
                </span>
                <select
                  id={patientSelectId}
                  className="input"
                  value={form.patient_id}
                  required
                  onChange={(e) => requestPatient(e.target.value)}
                >
                  {!form.patient_id && <option value="">No patients loaded</option>}
                  {shownPatients.map((p) => (
                    <option key={p.id} value={p.id}>
                      {patientName(p)}
                    </option>
                  ))}
                  {form.patient_id && !shownPatients.some((p) => p.id === form.patient_id) && (
                    <option value={form.patient_id}>Patient from this link</option>
                  )}
                </select>
              </label>
            </div>
            {patientSearchNote && (
              <p
                role={patientSearchNote.includes("failed") ? "alert" : "status"}
                className={patientSearchNote.includes("failed") ? alertClass : "text-sm text-muted"}
              >
                {patientSearchNote}
              </p>
            )}
            <label htmlFor={studySearchId} className="text-sm">
              <span className="label">Search studies</span>
              <input
                id={studySearchId}
                className="input"
                type="search"
                autoComplete="off"
                value={studyQuery}
                onChange={(e) => setStudyQuery(e.target.value)}
              />
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <div
                role="radiogroup"
                aria-label="Modality"
                className="flex flex-wrap gap-2"
                onKeyDown={onModalityKey}
              >
                <button
                  id="mod-all"
                  type="button"
                  role="radio"
                  aria-checked={!modality}
                  tabIndex={modality ? -1 : 0}
                  className={`admin-chip min-w-[44px] ${!modality ? "admin-chip--on" : ""}`}
                  onClick={() => setModality("")}
                >
                  All modalities
                </button>
                {MODALITIES.map((item) => (
                  <button
                    key={item.value}
                    id={`mod-${item.value}`}
                    type="button"
                    role="radio"
                    aria-checked={modality === item.value}
                    tabIndex={modality === item.value ? 0 : -1}
                    className={`admin-chip min-w-[44px] ${modality === item.value ? "admin-chip--on" : ""}`}
                    onClick={() => setModality(item.value)}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
              {filtersOn && (
                <button type="button" className="btn-ghost" onClick={clearFilters}>
                  Clear filters
                </button>
              )}
            </div>
            <DentalArchFilter
              available={availableTeeth}
              selected={toothFilter}
              onChange={(teeth) => {
                setToothFilter(teeth);
                if (teeth[0]) setForm((current) => ({ ...current, tooth: teeth[teeth.length - 1] ?? "" }));
              }}
            />
            <p className="text-sm text-muted">
              The last tooth you press is copied into the tooth field on Register study.
            </p>
            <p className="text-sm text-muted">
              {visible.length} of {scoped.length} studies
            </p>
            {scoped.length === 0 ? (
              <EmptyState
                title={patientLabel ? `No imaging studies for ${patientLabel}` : "No imaging studies yet"}
                hint="Register the first study for this patient."
                action={
                  <button type="button" className="btn-ghost" onClick={() => setFormOpen(true)} disabled={!form.patient_id}>
                    Register study
                  </button>
                }
              />
            ) : visible.length === 0 ? (
              <EmptyState
                title="No studies match these filters"
                hint="Clear the filters to see this patient's studies."
                action={
                  <button type="button" className="btn-ghost" onClick={clearFilters}>
                    Clear filters
                  </button>
                }
              />
            ) : (
              <ul className="flex flex-col gap-3">
                {visible.map((s) => {
                  const inCompare = compare.some((item) => item.id === s.id);
                  const opening = openingId === s.id;
                  return (
                    <li
                      key={s.id}
                      className="flex flex-col gap-3 rounded-2xl border border-brand-100 bg-canvas/70 p-3 lg:flex-row lg:items-center lg:justify-between"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-ink">
                          {modalityLabel(s.study_type)}
                          {s.tooth ? ` · tooth ${s.tooth}` : ""}
                        </p>
                        <p className="text-sm text-muted">
                          {formatWhen(s.captured_at)}
                          {s.byte_size != null ? ` · ${(s.byte_size / 1024).toFixed(1)} KB` : ""}
                        </p>
                        {s.original_filename && (
                          <p className="truncate text-sm text-muted" title={s.original_filename}>
                            {s.original_filename}
                          </p>
                        )}
                        <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink">
                          {s.has_content ? (
                            <span>Image on file</span>
                          ) : (
                            <span className="inline-flex items-center gap-1">
                              <ImageOff size={16} aria-hidden />
                              No image file
                            </span>
                          )}
                          {s.is_encrypted && (
                            <span className="inline-flex items-center gap-1">
                              <Lock size={16} aria-hidden />
                              Encrypted
                            </span>
                          )}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {s.has_content && (
                          <button
                            type="button"
                            className="btn-ghost"
                            disabled={opening}
                            onClick={() => requestOpen(s, false)}
                          >
                            {opening ? "Opening…" : "View"}
                          </button>
                        )}
                        {s.has_content && (
                          <button
                            type="button"
                            className="btn-ghost"
                            aria-pressed={inCompare}
                            disabled={opening || inCompare}
                            onClick={() => void addToCompare(s)}
                          >
                            {inCompare ? "In compare" : "Compare"}
                          </button>
                        )}
                        <button
                          type="button"
                          className="btn-ghost"
                          disabled={opening}
                          onClick={() => requestOpen(s, true)}
                        >
                          3D / MPR
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )}
      </section>

      {preview && (
        <section className="glass-panel rounded-3xl p-4" aria-labelledby="review-heading">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 id="review-heading" className="font-display text-lg font-bold text-brand-900">
                Review workspace
              </h2>
              <p className="mt-1 text-sm text-muted">
                {modalityLabel(preview.study.study_type)}
                {preview.study.tooth ? ` · tooth ${preview.study.tooth}` : ""} · indicative measurements only
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn-ghost" onClick={() => setMprOpen((open) => !open)}>
                {mprOpen ? "Hide 3D / MPR" : "Open 3D / MPR"}
              </button>
              <button type="button" className="btn-ghost" onClick={requestClosePreview}>
                Close review
              </button>
            </div>
          </div>
          <ImageViewer
            key={preview.id}
            src={preview.url}
            alt={`${modalityLabel(preview.study.study_type)}${preview.study.tooth ? ` tooth ${preview.study.tooth}` : ""} ${formatWhen(preview.study.captured_at)}`}
            toothHint={preview.study.tooth}
            onAnnotationCount={setMarkCount}
          />
        </section>
      )}

      {mprOpen && (
        <section className="glass-panel rounded-3xl p-4" aria-labelledby="mpr-heading">
          <VolumeWorkspace
            scoutUrl={preview && preview.id === mprStudyId ? preview.url : undefined}
            implants={visible
              .filter((s) => s.notes?.toLowerCase().includes("implant"))
              .map((s) => s.tooth || "")
              .filter(Boolean)}
            selected={form.tooth || preview?.study.tooth || null}
            onSelect={(fdi) => setForm((current) => ({ ...current, tooth: fdi }))}
          />
        </section>
      )}

      {compare.length > 0 && (
        <section className="glass-panel rounded-3xl p-4" aria-labelledby="compare-heading">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 id="compare-heading" className="font-display text-lg font-bold text-brand-900">
                Before / after compare
              </h2>
              <p className="mt-1 text-sm text-muted">
                {compare.length === 1
                  ? "Choose a second study with Compare to view both sides. A third choice replaces the older side."
                  : "Each side has its own zoom, window, and marks."}
              </p>
            </div>
            <button type="button" className="btn-ghost" onClick={requestClearCompare}>
              Clear compare
            </button>
          </div>
          {compare.length === 2 && compare[0] && compare[1] ? (
            <CompareViewer
              left={compare[0].url}
              right={compare[1].url}
              leftLabel={compare[0].label}
              rightLabel={compare[1].label}
              onAnnotationCount={setCompareMarks}
            />
          ) : (
            <p className="text-sm text-muted">1 of 2 selected — {compare[0]?.label}</p>
          )}
        </section>
      )}

      <section aria-labelledby="clinic-snapshot-heading" className="space-y-3">
        <h2 id="clinic-snapshot-heading" className="font-display text-lg font-bold text-brand-900">
          Clinic snapshot
        </h2>
        {!home && !homeError && (
          <p className="text-sm text-muted" role="status">
            Loading clinic snapshot…
          </p>
        )}
        {home && <StatGrid home={home} />}
      </section>

      {formOpen && (
        <Modal
          title="Register study"
          subtitle={patientLabel || "No patient selected"}
          onClose={closeForm}
          footer={
            <div className="flex flex-wrap justify-end gap-2">
              <button type="button" className="btn-ghost" onClick={closeForm} disabled={saving}>
                Cancel
              </button>
              <button type="submit" form="register-study-form" className="btn-primary" disabled={saving || !form.patient_id}>
                {saving
                  ? "Registering…"
                  : `${form.file ? "Register study and upload" : "Register study"}${
                      selectedPatient ? ` for ${selectedPatient.patient_code}` : ""
                    }`}
              </button>
            </div>
          }
        >
          <form id="register-study-form" className="grid gap-4 md:grid-cols-2" aria-busy={saving} onSubmit={onCreate}>
            <p className="text-sm md:col-span-2">
              <span className="label">Patient</span>
              {patientLabel || "No patient selected. Cancel and choose a patient on the page."}
            </p>
            <label htmlFor={studyTypeId} className="text-sm">
              <span className="label">
                Study type <span className="font-normal text-muted">(required)</span>
              </span>
              <select
                id={studyTypeId}
                className="input"
                value={form.study_type}
                onChange={(e) => setForm({ ...form, study_type: e.target.value })}
              >
                {MODALITIES.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            <label htmlFor={toothId} className="text-sm">
              <span className="label">Tooth</span>
              <input
                id={toothId}
                className="input"
                value={form.tooth}
                autoComplete="off"
                aria-describedby={toothHintId}
                onChange={(e) => setForm({ ...form, tooth: e.target.value })}
              />
              <span id={toothHintId} className="mt-1 block text-xs text-muted">
                FDI number. Optional. The tooth filter and 3D tooth list can fill this in.
              </span>
            </label>
            <label htmlFor={notesId} className="text-sm md:col-span-2">
              <span className="label">Notes</span>
              <input
                id={notesId}
                className="input"
                value={form.notes}
                autoComplete="off"
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </label>
            <label htmlFor={fileId} className="text-sm md:col-span-2">
              <span className="label">Image or DICOM file</span>
              <input
                key={fileKey}
                id={fileId}
                className="input"
                type="file"
                accept="image/*,.dcm,application/dicom"
                aria-describedby={fileHintId}
                onChange={(e) => setForm({ ...form, file: e.target.files?.[0] || null })}
              />
              <span id={fileHintId} className="mt-1 block text-xs text-muted">
                Optional. If the upload fails, the study is still saved and you can retry the same file.
              </span>
              {form.file && (
                <span className="mt-1 block text-sm text-ink">
                  {form.file.name} · {(form.file.size / 1024).toFixed(1)} KB
                </span>
              )}
            </label>
          </form>
        </Modal>
      )}
    </div>
  );
}
