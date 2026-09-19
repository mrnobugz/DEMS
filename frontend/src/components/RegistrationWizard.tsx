import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowRight, Save, Sparkles } from "lucide-react";
import { ConfirmAction } from "@/components/config/ConfigUi";
import {
  ClerkshipIntakeFields,
  clerkshipGaps,
  clerkshipPayload,
  emptyClerkshipForm,
  formFromPatient,
  isMinor,
  type ClerkshipFormState,
} from "@/components/ClerkshipIntakeFields";
import { ConsentPad, type ConsentCapture } from "@/components/ConsentPad";
import { PatientIdentityPhoto } from "@/components/PatientIdentityPhoto";
import { RegistrationPrintPanel } from "@/components/RegistrationPrintPanel";
import { api, ApiError } from "@/lib/api";
import { formatMoney } from "@/lib/i18n";
import { fetchPatientPhotoDataUrl, uploadPatientPhoto } from "@/lib/patientPhoto";
import { registrationPrintData } from "@/lib/printRegistration";
import type {
  InventoryItem,
  Page,
  Patient,
  PatientRegisterResult,
  RegistrationDraft,
  RegistrationSlot,
} from "@/lib/types";
import { useUiPrefs } from "@/lib/uiPrefs";

const DEPARTMENTS = [
  { id: "restorative", label: "Restorative" },
  { id: "maxillofacial", label: "Maxillofacial" },
  { id: "orthodontic", label: "Orthodontic" },
  { id: "paediatric", label: "Paediatric" },
] as const;

const STEP_META = [
  { label: "Particulars", hint: "Search a returning patient or open a new file" },
  { label: "Items to pay", hint: "Warehouse fees for this visit" },
  { label: "Payment", hint: "Payer type and amount received" },
  { label: "Service & slot", hint: "Staff, queue and booking" },
  { label: "Consent", hint: "Signature before routing" },
  { label: "Finalize", hint: "Review and send to clinical" },
] as const;

const INSURERS = [
  { id: "jubilee", label: "Jubilee" },
  { id: "nhif", label: "NHIF" },
  { id: "other", label: "Other" },
] as const;

type QtyMap = Record<string, number>;
type MedicalStaff = { id: string; full_name: string; role?: string; specialty?: string };
type PayerType = "self" | "insurance" | "other";

/** Everything needed to reopen an unfinished registration. The identity photo is not kept. */
type DraftPayload = {
  version: 1;
  step: number;
  max_reached: number;
  form: ClerkshipFormState;
  existing_id: string;
  existing_meta: { code: string; name: string } | null;
  qty: QtyMap;
  payer_type: PayerType;
  method: string;
  insurer: string;
  insurer_name: string;
  reference: string;
  outstanding: boolean;
  amount_paid: number;
  service_name: string;
  slot_date: string;
  slot_start: string;
  staff_id: string;
  is_appointment: boolean;
  consent: ConsentCapture | null;
  department: string;
};

const PAYER_TYPES: readonly PayerType[] = ["self", "insurance", "other"];

function draftLabel(form: ClerkshipFormState, meta: { name: string } | null) {
  const typed = `${form.first_name} ${form.last_name}`.trim();
  return typed || meta?.name?.trim() || "Unnamed patient";
}

function draftSummary(payload: DraftPayload, total: number, currency: string, locale: string) {
  const parts = [`${STEP_META[payload.step]?.label ?? "Particulars"} (step ${payload.step + 1} of ${STEP_META.length})`];
  if (payload.form.chief_complaint?.trim()) parts.push(payload.form.chief_complaint.trim());
  if (total > 0) parts.push(`due ${formatMoney(total, currency, locale)}`);
  return parts.join(" · ").slice(0, 300);
}

/** Reads back a stored payload defensively: an older or partial draft must still open. */
function readDraftPayload(raw: unknown): DraftPayload | null {
  if (!raw || typeof raw !== "object") return null;
  const data = raw as Record<string, unknown>;
  if (!data.form || typeof data.form !== "object") return null;
  const str = (key: string, fallback = "") =>
    typeof data[key] === "string" ? (data[key] as string) : fallback;
  const num = (key: string, fallback = 0) =>
    typeof data[key] === "number" && Number.isFinite(data[key]) ? (data[key] as number) : fallback;
  const bool = (key: string, fallback: boolean) =>
    typeof data[key] === "boolean" ? (data[key] as boolean) : fallback;
  const payer = str("payer_type", "self") as PayerType;
  const meta = data.existing_meta as { code?: unknown; name?: unknown } | null | undefined;
  return {
    version: 1,
    step: Math.min(Math.max(Math.trunc(num("step")), 0), STEP_META.length - 1),
    max_reached: Math.min(Math.max(Math.trunc(num("max_reached")), 0), STEP_META.length - 1),
    form: { ...emptyClerkshipForm(), ...(data.form as Partial<ClerkshipFormState>) },
    existing_id: str("existing_id"),
    existing_meta:
      meta && typeof meta.code === "string" && typeof meta.name === "string"
        ? { code: meta.code, name: meta.name }
        : null,
    qty:
      data.qty && typeof data.qty === "object"
        ? Object.fromEntries(
            Object.entries(data.qty as Record<string, unknown>)
              .filter(([, v]) => typeof v === "number" && Number.isFinite(v))
              .map(([k, v]) => [k, v as number]),
          )
        : {},
    payer_type: PAYER_TYPES.includes(payer) ? payer : "self",
    method: str("method", "cash"),
    insurer: str("insurer", "jubilee"),
    insurer_name: str("insurer_name"),
    reference: str("reference"),
    outstanding: bool("outstanding", false),
    amount_paid: num("amount_paid"),
    service_name: str("service_name"),
    slot_date: str("slot_date") || todayInput(),
    slot_start: str("slot_start"),
    staff_id: str("staff_id"),
    is_appointment: bool("is_appointment", true),
    consent:
      data.consent && typeof data.consent === "object"
        ? (data.consent as ConsentCapture)
        : null,
    department: str("department"),
  };
}

function savedAtLabel(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function staffLabel(row: MedicalStaff) {
  const role = (row.role || "").replaceAll("_", " ");
  const extra = [role, row.specialty].filter(Boolean).join(" · ");
  return extra ? `${row.full_name} (${extra})` : row.full_name;
}

function itemPrice(item: InventoryItem) {
  return item.sale_price > 0 ? item.sale_price : item.unit_cost;
}

function todayInput() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function slotLabel(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function PatientLookup({
  selected,
  onPick,
  onClear,
}: {
  selected: { code: string; name: string } | null;
  onPick: (patient: Patient) => void;
  onClear: () => void;
}) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Patient[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const query = q.trim();
    if (query.length < 2) {
      setHits([]);
      return;
    }
    const handle = window.setTimeout(() => {
      setBusy(true);
      api<Page<Patient>>(`/api/v1/patients?limit=8&q=${encodeURIComponent(query)}`)
        .then((data) => {
          setHits(data.items);
          setOpen(true);
        })
        .catch(() => setHits([]))
        .finally(() => setBusy(false));
    }, 280);
    return () => window.clearTimeout(handle);
  }, [q]);

  if (selected) {
    return (
      <div className="reg-section flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="reg-section__title" style={{ marginBottom: 2 }}>
            Returning patient
          </p>
          <p className="text-sm font-semibold text-brand-900">
            {selected.name}{" "}
            <span className="font-mono text-xs font-normal text-muted">{selected.code}</span>
          </p>
          <p className="text-xs text-muted">File already exists. Update details only if needed.</p>
        </div>
        <button type="button" className="btn-ghost" onClick={onClear}>
          New file
        </button>
      </div>
    );
  }

  return (
    <div className="reg-lookup">
      <label className="label">Already visited?</label>
      <input
        className="input"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => hits.length > 0 && setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 150)}
        placeholder="Search name, phone, file no., ID…"
        autoComplete="off"
      />
      {busy && <p className="mt-1 text-xs text-muted">Searching…</p>}
      {open && hits.length > 0 && (
        <div className="reg-lookup__list" role="listbox">
          {hits.map((row) => (
            <button
              key={row.id}
              type="button"
              className="reg-lookup__hit"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onPick(row);
                setQ("");
                setHits([]);
                setOpen(false);
              }}
            >
              <span className="font-semibold text-brand-900">
                {row.first_name} {row.last_name}
              </span>
              <span className="mt-0.5 block font-mono text-xs text-muted">
                {row.patient_code}
                {row.phone ? ` · ${row.phone}` : ""}
                {row.national_id ? ` · ${row.national_id}` : ""}
              </span>
            </button>
          ))}
        </div>
      )}
      {open && q.trim().length >= 2 && !busy && hits.length === 0 && (
        <p className="mt-1 text-xs text-muted">No matching file — continue as a new patient.</p>
      )}
    </div>
  );
}

function localDaySlots(day: string, durationMinutes = 30): RegistrationSlot[] {
  const slots: RegistrationSlot[] = [];
  const start = new Date(`${day}T08:00:00`);
  const end = new Date(`${day}T17:00:00`);
  if (Number.isNaN(start.getTime())) return slots;
  for (let cursor = start.getTime(); cursor + durationMinutes * 60_000 <= end.getTime(); cursor += durationMinutes * 60_000) {
    const from = new Date(cursor);
    const to = new Date(cursor + durationMinutes * 60_000);
    slots.push({ starts_at: from.toISOString(), ends_at: to.toISOString(), available: true });
  }
  return slots;
}

export function RegistrationWizard({ onDone }: { onDone: () => void }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const syncUrl = location.pathname.startsWith("/front-desk/register");
  const currency = useUiPrefs((s) => s.currency);
  const locale = useUiPrefs((s) => s.locale);
  const money = (n: number) => formatMoney(n, currency, locale);

  const [step, setStep] = useState(() => {
    const n = Number(params.get("step") || 0);
    return Number.isFinite(n) ? Math.min(Math.max(Math.trunc(n), 0), STEP_META.length - 1) : 0;
  });
  const [maxReached, setMaxReached] = useState(step);
  const [form, setForm] = useState<ClerkshipFormState>(emptyClerkshipForm);
  const [existingId, setExistingId] = useState(() => params.get("patient") || "");
  const [existingMeta, setExistingMeta] = useState<{ code: string; name: string } | null>(null);
  const [catalog, setCatalog] = useState<InventoryItem[]>([]);
  const [qty, setQty] = useState<QtyMap>({});
  const [payerType, setPayerType] = useState<"self" | "insurance" | "other">("self");
  const [method, setMethod] = useState("cash");
  const [insurer, setInsurer] = useState("jubilee");
  const [insurerName, setInsurerName] = useState("");
  const [reference, setReference] = useState("");
  const [outstanding, setOutstanding] = useState(false);
  const [amountPaid, setAmountPaid] = useState(0);
  const [serviceName, setServiceName] = useState("");
  const [slotDate, setSlotDate] = useState(todayInput);
  const [slotStart, setSlotStart] = useState("");
  const [staff, setStaff] = useState<MedicalStaff[]>([]);
  const [staffId, setStaffId] = useState("");
  const [isAppointment, setIsAppointment] = useState(true);
  const [slots, setSlots] = useState<RegistrationSlot[]>([]);
  const [nextQueue, setNextQueue] = useState<number | null>(null);
  const [consent, setConsent] = useState<ConsentCapture | null>(null);
  const [department, setDepartment] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<PatientRegisterResult | null>(null);
  const [photoDataUrl, setPhotoDataUrl] = useState("");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [draftId, setDraftId] = useState(() => params.get("draft") || "");
  const [draftSavedAt, setDraftSavedAt] = useState("");
  const [draftBusy, setDraftBusy] = useState(false);
  const [draftNote, setDraftNote] = useState("");
  const [draftError, setDraftError] = useState("");
  const [resuming, setResuming] = useState(() => Boolean(params.get("draft")));
  const draftIdRef = useRef(draftId);
  draftIdRef.current = draftId;

  useEffect(() => {
    api<InventoryItem[]>("/api/v1/inventory?billable_at_registration=true")
      .then(setCatalog)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Could not load warehouse items"));
    api<MedicalStaff[]>("/api/v1/staff/dentists")
      .then((rows) => {
        setStaff(rows);
        if (rows[0]) setStaffId(rows[0].id);
      })
      .catch(() => setStaff([]));
  }, []);

  const selected = useMemo(
    () => catalog.filter((item) => (qty[item.id] || 0) > 0),
    [catalog, qty],
  );
  const total = useMemo(
    () => selected.reduce((sum, item) => sum + itemPrice(item) * (qty[item.id] || 0), 0),
    [selected, qty],
  );

  useEffect(() => {
    if (!outstanding) setAmountPaid(total);
  }, [total, outstanding]);

  useEffect(() => {
    if (department) return;
    const hinted = selected.find((item) =>
      DEPARTMENTS.some((d) => d.id === item.target_department),
    );
    if (hinted?.target_department) setDepartment(hinted.target_department);
  }, [selected, department]);

  useEffect(() => {
    if (!serviceName && selected[0]) setServiceName(selected[0].name);
  }, [selected, serviceName]);

  useEffect(() => {
    if (step !== 3) return;
    const day = isAppointment ? slotDate : todayInput();
    api<{ slots: RegistrationSlot[]; next_queue_number: number }>(
      `/api/v1/appointments/registration-slots?day=${day}&duration_minutes=30`,
    )
      .then((data) => {
        setSlots(data.slots);
        setNextQueue(data.next_queue_number);
        if (slotStart && !data.slots.some((s) => s.starts_at === slotStart && s.available)) {
          setSlotStart("");
        }
      })
      .catch((err) => {
        setSlots(localDaySlots(day));
        setNextQueue((n) => n ?? 1);
        setError(err instanceof ApiError ? err.message : "Could not load time slots");
      });
  }, [step, slotDate, isAppointment]);

  function writeParams(nextStep: number, patientId = existingId, draft = draftIdRef.current) {
    if (!syncUrl) return;
    const next: Record<string, string> = { step: String(nextStep) };
    if (patientId) next.patient = patientId;
    if (draft) next.draft = draft;
    setParams(next, { replace: true });
  }

  function applyExisting(row: Patient) {
    setExistingId(row.id);
    setExistingMeta({
      code: row.patient_code,
      name: `${row.first_name} ${row.last_name}`.trim(),
    });
    setForm(formFromPatient(row));
    setError("");
    writeParams(step, row.id);
    if (row.has_photo) {
      void fetchPatientPhotoDataUrl(row.id).then((url) => {
        if (url) setPhotoDataUrl(url);
      });
    }
  }

  function clearExisting() {
    setExistingId("");
    setExistingMeta(null);
    setForm(emptyClerkshipForm());
    setPhotoDataUrl("");
    setPhotoFile(null);
    writeParams(step, "");
  }

  async function pickExisting(row: Patient) {
    try {
      const full = await api<Patient>(`/api/v1/patients/${row.id}`);
      applyExisting(full);
    } catch {
      applyExisting(row);
    }
  }

  function collectDraft(atStep = step): DraftPayload {
    return {
      version: 1,
      step: atStep,
      max_reached: Math.max(maxReached, atStep),
      form,
      existing_id: existingId,
      existing_meta: existingMeta,
      qty,
      payer_type: payerType,
      method,
      insurer,
      insurer_name: insurerName,
      reference,
      outstanding,
      amount_paid: amountPaid,
      service_name: serviceName,
      slot_date: slotDate,
      slot_start: slotStart,
      staff_id: staffId,
      is_appointment: isAppointment,
      consent,
      department,
    };
  }

  function applyDraft(draft: RegistrationDraft) {
    const payload = readDraftPayload(draft.payload);
    if (!payload) {
      setDraftError("This draft could not be opened. Start the registration again.");
      return;
    }
    setForm(payload.form);
    setExistingId(payload.existing_id);
    setExistingMeta(payload.existing_meta);
    setQty(payload.qty);
    setPayerType(payload.payer_type);
    setMethod(payload.method);
    setInsurer(payload.insurer);
    setInsurerName(payload.insurer_name);
    setReference(payload.reference);
    setOutstanding(payload.outstanding);
    setAmountPaid(payload.amount_paid);
    setServiceName(payload.service_name);
    setSlotDate(payload.slot_date);
    setSlotStart(payload.slot_start);
    if (payload.staff_id) setStaffId(payload.staff_id);
    setIsAppointment(payload.is_appointment);
    setConsent(payload.consent);
    setDepartment(payload.department);
    setMaxReached(payload.max_reached);
    setStep(payload.step);
    setDraftId(draft.id);
    draftIdRef.current = draft.id;
    setDraftSavedAt(draft.updated_at);
    setDraftNote("Unfinished registration reopened. Review each step before finalizing.");
    setError("");
    writeParams(payload.step, payload.existing_id, draft.id);
    if (payload.existing_id) {
      void fetchPatientPhotoDataUrl(payload.existing_id).then((url) => {
        if (url) setPhotoDataUrl(url);
      });
    }
  }

  /** Writes the wizard state to the server. `quiet` is for the automatic save between steps. */
  async function saveDraft(atStep = step, quiet = false): Promise<boolean> {
    const payload = collectDraft(atStep);
    const id = draftIdRef.current;
    setDraftBusy(true);
    setDraftError("");
    if (!quiet) setDraftNote("");
    try {
      const saved = await api<RegistrationDraft>(
        id ? `/api/v1/patients/registration-drafts/${id}` : "/api/v1/patients/registration-drafts",
        {
          method: id ? "PUT" : "POST",
          body: JSON.stringify({
            patient_id: existingId || null,
            display_name: draftLabel(form, existingMeta),
            summary: draftSummary(payload, total, currency, locale),
            step: atStep,
            payload,
          }),
        },
      );
      if (!id) {
        setDraftId(saved.id);
        draftIdRef.current = saved.id;
        writeParams(atStep, existingId, saved.id);
      }
      setDraftSavedAt(saved.updated_at);
      if (!quiet) setDraftNote("Saved. Reopen it from the Today board under unfinished registrations.");
      return true;
    } catch (err) {
      setDraftError(
        err instanceof ApiError ? err.message : "Could not save this registration as a draft",
      );
      return false;
    } finally {
      setDraftBusy(false);
    }
  }

  function resetWizard(nextStep = 0) {
    setForm(emptyClerkshipForm());
    setExistingId("");
    setExistingMeta(null);
    setQty({});
    setPayerType("self");
    setMethod("cash");
    setInsurer("jubilee");
    setInsurerName("");
    setReference("");
    setOutstanding(false);
    setAmountPaid(0);
    setServiceName("");
    setSlotDate(todayInput());
    setSlotStart("");
    setIsAppointment(true);
    setConsent(null);
    setDepartment("");
    setPhotoDataUrl("");
    setPhotoFile(null);
    setDraftId("");
    draftIdRef.current = "";
    setDraftSavedAt("");
    setError("");
    setStep(nextStep);
    setMaxReached(nextStep);
    if (syncUrl) setParams({ step: String(nextStep) }, { replace: true });
  }

  async function cancelRegistration() {
    const id = draftIdRef.current;
    setDraftError("");
    if (!id) {
      resetWizard();
      setDraftNote("Registration cleared. Nothing was saved.");
      return;
    }
    setDraftBusy(true);
    try {
      await api<RegistrationDraft>(`/api/v1/patients/registration-drafts/${id}/cancel`, {
        method: "POST",
        body: JSON.stringify({ reason: "Cancelled at the front desk" }),
      });
      resetWizard();
      setDraftNote("Registration cancelled. It is off the unfinished list.");
    } catch (err) {
      setDraftError(
        err instanceof ApiError ? err.message : "Could not cancel this unfinished registration",
      );
    } finally {
      setDraftBusy(false);
    }
  }

  function goTo(next: number) {
    if (next < 0 || next > maxReached || next >= STEP_META.length) return;
    setError("");
    setStep(next);
    writeParams(next);
  }

  useEffect(() => {
    const id = params.get("draft");
    if (!id) return;
    setResuming(true);
    api<RegistrationDraft>(`/api/v1/patients/registration-drafts/${id}`)
      .then((draft) => {
        if (draft.status !== "open") {
          setDraftError(
            draft.status === "completed"
              ? "That registration was already finalized."
              : "That unfinished registration was cancelled.",
          );
          return;
        }
        applyDraft(draft);
      })
      .catch((err) =>
        setDraftError(
          err instanceof ApiError ? err.message : "Could not open that unfinished registration",
        ),
      )
      .finally(() => setResuming(false));
  }, []);

  useEffect(() => {
    const id = params.get("patient");
    if (!id || existingMeta || params.get("draft")) return;
    api<Patient>(`/api/v1/patients/${id}`)
      .then(applyExisting)
      .catch(() => setError("Could not load that patient file"));
  }, []);

  useEffect(() => {
    if (!syncUrl) return;
    const requested = Number(params.get("step") || 0);
    if (!Number.isFinite(requested)) return;
    const clamped = Math.min(Math.max(Math.trunc(requested), 0), maxReached);
    if (clamped !== step) setStep(clamped);
    if (clamped !== requested) writeParams(clamped);
  }, [params, maxReached, syncUrl]);

  function toggle(item: InventoryItem) {
    setQty((prev) => ({ ...prev, [item.id]: prev[item.id] ? 0 : 1 }));
  }

  function paymentReady() {
    if (total <= 0) return false;
    if (payerType === "insurance") {
      if (!insurer) return false;
      if (insurer === "other" && !insurerName.trim()) return false;
    }
    if (payerType === "other" && !insurerName.trim() && !reference.trim()) return false;
    if (outstanding) return amountPaid >= 0 && amountPaid <= total + 0.001;
    return amountPaid + 0.001 >= total;
  }

  function canAdvance() {
    if (step === 0) return clerkshipGaps(form).length === 0;
    if (step === 1) return selected.length > 0 && total > 0;
    if (step === 2) return paymentReady();
    if (step === 3) {
      if (!serviceName || !staffId) return false;
      return isAppointment ? Boolean(slotStart) : true;
    }
    if (step === 4) return Boolean(consent?.signature_data && consent.signed_by_name);
    if (step === 5) return Boolean(department);
    return false;
  }

  async function finalize() {
    setError("");
    if (!consent || !department || !serviceName || !staffId) {
      setError("Service, medical staff, consent, and destination department are required");
      return;
    }
    if (isAppointment && !slotStart) {
      setError("Choose a time slot for the appointment");
      return;
    }
    setBusy(true);
    try {
      const created = await api<PatientRegisterResult>("/api/v1/patients/register", {
        method: "POST",
        body: JSON.stringify({
          patient_id: existingId || null,
          patient: clerkshipPayload(form),
          items: selected.map((item) => ({
            inventory_item_id: item.id,
            quantity: qty[item.id] || 1,
          })),
          payment: {
            amount: outstanding ? amountPaid : total,
            payer_type: payerType,
            method: payerType === "self" ? method : payerType === "insurance" ? "insurance" : "other",
            insurer: payerType === "insurance" ? insurer : null,
            insurer_name: insurerName || null,
            reference: reference || null,
            outstanding,
          },
          appointment: {
            service_name: serviceName,
            dentist_id: staffId,
            is_appointment: isAppointment,
            starts_at: isAppointment ? slotStart : null,
            duration_minutes: 30,
          },
          consent,
          destination_department: department,
          draft_id: draftIdRef.current || null,
        }),
      });
      setDraftId("");
      draftIdRef.current = "";
      setDraftSavedAt("");
      setDraftNote("");
      setDraftError("");
      if (photoFile) {
        try {
          await uploadPatientPhoto(created.patient.id, photoFile);
          created.patient.has_photo = true;
        } catch (photoErr) {
          setError(
            photoErr instanceof ApiError
              ? `File opened, but photo was not saved: ${photoErr.message}`
              : "File opened, but the identity photo could not be saved",
          );
        }
      }
      setResult(created);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not finalize registration");
    } finally {
      setBusy(false);
    }
  }

  if (result) {
    const dest = DEPARTMENTS.find((d) => d.id === result.destination_department)?.label;
    const slot = result.slot_starts_at ? slotLabel(result.slot_starts_at) : "";
    const printable = registrationPrintData({
      patient: result.patient,
      photoDataUrl,
      queueNumber: result.queue_number,
      serviceName: result.service_name,
      department: result.destination_department,
      staffName: result.medical_staff_name,
      startsAt: result.slot_starts_at,
      isAppointment: result.is_appointment,
    });
    return (
      <div className="reg-done animate-rise">
        <div className="reg-done__banner">
          <p className="mb-1 inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-white/80">
            <Sparkles size={14} /> File opened
          </p>
          <h3 className="font-display text-2xl font-bold">
            {result.patient.first_name} {result.patient.last_name}
          </h3>
          <p className="mt-1 text-sm text-white/80">
            {result.patient.patient_code} · invoice {result.invoice.invoice_number} · {money(result.invoice.total)}
          </p>
        </div>
        <div className="grid gap-2 p-4 sm:grid-cols-2">
          <div className="reg-section">
            <p className="reg-section__title">Outstanding</p>
            <p className="text-lg font-bold text-brand-900">{result.outstanding ? "Yes" : "No"}</p>
            {result.outstanding && (
              <p className="text-sm text-muted">
                {money(result.invoice.total - result.invoice.amount_paid)} remaining
              </p>
            )}
          </div>
          <div className="reg-queue">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-white/70">Queue</div>
              <strong>Q{result.queue_number ?? "—"}</strong>
            </div>
            <div className="text-right text-sm text-white/85">
              <div>{result.service_name}</div>
              <div>{result.is_appointment === false ? "Walk-in" : `Appointment${slot ? ` · ${slot}` : ""}`}</div>
              {result.medical_staff_name && <div>{result.medical_staff_name}</div>}
            </div>
          </div>
        </div>
        <RegistrationPrintPanel data={printable} />
        <div className="flex flex-wrap gap-2 px-4 pb-4">
          <button
            type="button"
            className="btn-ghost inline-flex items-center gap-2"
            onClick={() => navigate(`${result.clinical_path}?patient=${result.patient.id}`)}
          >
            Send to {dest} <ArrowRight size={16} />
          </button>
          <button
            type="button"
            className="btn-ghost"
            onClick={() => {
              setResult(null);
              resetWizard();
              setDraftNote("");
              onDone();
            }}
          >
            Register another
          </button>
        </div>
      </div>
    );
  }

  const currentMeta = STEP_META[step];
  const progress = Math.round(((step + 1) / STEP_META.length) * 100);
  const draftReady = Boolean(
    form.first_name.trim() || form.last_name.trim() || existingId,
  );

  return (
    <div className="reg-shell">
      <section className="reg-stage">
        <header className="reg-stage__head">
          <div className="min-w-0">
            <h3 className="font-display text-base font-bold leading-tight text-brand-900">
              {currentMeta.label}
            </h3>
            <p className="text-xs text-muted">{currentMeta.hint}</p>
          </div>
          <span className="text-xs font-semibold tabular-nums text-muted">
            {resuming ? "Opening draft…" : `${step + 1}/${STEP_META.length}`}
          </span>
          {draftId && !resuming && (
            <span className="status-pill status-pill--info">Unfinished registration</span>
          )}
          <div className="reg-progress" aria-hidden>
            <span style={{ width: `${progress}%` }} />
          </div>
        </header>
        <div key={step} className="reg-stage__body">
          {step === 0 && (
            <div className="space-y-2.5">
              <PatientLookup
                selected={existingMeta}
                onPick={(row) => void pickExisting(row)}
                onClear={clearExisting}
              />
              <PatientIdentityPhoto
                value={photoDataUrl}
                persistHint={
                  draftId && !photoDataUrl
                    ? "Photos are not kept in a draft — take it again before finalizing"
                    : "Saved to the patient file when you finalize"
                }
                onChange={(url, file) => {
                  setPhotoDataUrl(url);
                  setPhotoFile(file);
                }}
              />
              <ClerkshipIntakeFields form={form} onChange={setForm} mode="create" variant="reception" />
            </div>
          )}

      {step === 1 && (
        <div className="space-y-3">
          <p className="text-xs text-muted">
            Warehouse fees for this visit. These become the appointment service.
          </p>
          {catalog.length === 0 ? (
            <p className="rounded-2xl bg-red-50 px-3 py-2 text-sm text-red-700">
              No registration items in Warehouse. Ask an admin to add billable services.
            </p>
          ) : (
            <ul className="space-y-2">
              {catalog.map((item) => {
                const checked = (qty[item.id] || 0) > 0;
                return (
                  <li key={item.id}>
                    <label className={`reg-sku ${checked ? "reg-sku--on" : ""}`}>
                      <input type="checkbox" checked={checked} onChange={() => toggle(item)} />
                      <span className="min-w-0 flex-1">
                        <span className="block font-semibold text-brand-900">{item.name}</span>
                        <span className="font-mono text-xs text-muted">{item.sku}</span>
                      </span>
                      <span className="text-sm font-bold text-brand-800">{money(itemPrice(item))}</span>
                      {checked && (
                        <input
                          type="number"
                          min={1}
                          max={20}
                          className="input w-20"
                          value={qty[item.id]}
                          onChange={(e) =>
                            setQty((prev) => ({
                              ...prev,
                              [item.id]: Math.max(1, Number(e.target.value) || 1),
                            }))
                          }
                        />
                      )}
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
          <div className="flex items-center justify-between rounded-xl bg-brand-50 px-3 py-2">
            <span className="text-xs text-muted">Due now</span>
            <span className="font-display text-lg font-bold text-brand-900">{money(total)}</span>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-3">
          <div className="reg-section">
            <p className="reg-section__title">Selected fees</p>
            <ul className="space-y-2 text-sm">
              {selected.map((item) => (
                <li key={item.id} className="flex justify-between gap-3">
                  <span>
                    {item.name} <span className="text-muted">× {qty[item.id]}</span>
                  </span>
                  <span className="font-semibold">{money(itemPrice(item) * (qty[item.id] || 0))}</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <label className="label">Payment type</label>
            <div className="grid gap-2 sm:grid-cols-3">
              {(
                [
                  ["self", "Self payment", "Cash, card, mobile money"],
                  ["insurance", "Health benefits", "Jubilee, NHIF, others"],
                  ["other", "Others", "Corporate, waiver, account"],
                ] as const
              ).map(([id, label, hint]) => (
                <label key={id} className={`reg-choice ${payerType === id ? "reg-choice--on" : ""}`}>
                  <input
                    type="radio"
                    name="payer"
                    checked={payerType === id}
                    onChange={() => setPayerType(id)}
                  />
                  <span>
                    <span className="block text-sm font-semibold">{label}</span>
                    <span className="block text-xs font-normal text-muted">{hint}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>

          {payerType === "self" && (
            <div>
              <label className="label">How paid</label>
              <select className="input" value={method} onChange={(e) => setMethod(e.target.value)}>
                <option value="cash">Cash</option>
                <option value="mobile_money">Mobile money</option>
                <option value="card">Card</option>
                <option value="bank_transfer">Bank transfer</option>
              </select>
            </div>
          )}

          {payerType === "insurance" && (
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label className="label">Insurer / scheme</label>
                <select className="input" value={insurer} onChange={(e) => setInsurer(e.target.value)}>
                  {INSURERS.map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.label}
                    </option>
                  ))}
                </select>
              </div>
              {(insurer === "other" || insurer === "jubilee") && (
                <div>
                  <label className="label">{insurer === "other" ? "Other scheme name" : "Member / plan (optional)"}</label>
                  <input
                    className="input"
                    value={insurerName}
                    onChange={(e) => setInsurerName(e.target.value)}
                    placeholder={insurer === "other" ? "e.g. AAR, Strategies" : "Optional"}
                    required={insurer === "other"}
                  />
                </div>
              )}
            </div>
          )}

          {payerType === "other" && (
            <div>
              <label className="label">Describe other payment</label>
              <input
                className="input"
                value={insurerName}
                onChange={(e) => setInsurerName(e.target.value)}
                placeholder="e.g. corporate account, waiver"
                required
              />
            </div>
          )}

          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label className="label">Amount received</label>
              <input
                className="input"
                type="number"
                min={0}
                max={total}
                value={amountPaid}
                onChange={(e) => {
                  const next = Number(e.target.value) || 0;
                  setAmountPaid(next);
                  setOutstanding(next + 0.001 < total);
                }}
              />
            </div>
            <div>
              <label className="label">Reference / claim / receipt</label>
              <input
                className="input"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="Optional"
              />
            </div>
          </div>

          <div>
            <label className="label">Outstanding</label>
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  [false, "No — paid in full"],
                  [true, "Yes — balance remains"],
                ] as const
              ).map(([flag, label]) => (
                <button
                  key={String(flag)}
                  type="button"
                  className={`reg-choice ${outstanding === flag ? "reg-choice--on" : ""} ${
                    flag && outstanding ? "border-amber-400" : ""
                  }`}
                  onClick={() => {
                    setOutstanding(flag);
                    if (!flag) setAmountPaid(total);
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
            <p className="mt-2 text-sm">
              Outstanding: <strong>{outstanding ? "Yes" : "No"}</strong>
              {outstanding && (
                <span className="ml-2 text-muted">Balance {money(Math.max(total - amountPaid, 0))}</span>
              )}
            </p>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-3">
          <p className="text-xs text-muted">
            Staff, queue, and walk-in or booked time.
          </p>
          <div className="reg-section grid gap-3 md:grid-cols-2">
            <div>
              <label className="label">
                Service <span className="text-red-600">*</span>
              </label>
              <select
                className="input"
                required
                value={serviceName}
                onChange={(e) => setServiceName(e.target.value)}
              >
                {selected.length === 0 && <option value="">Select a paid item first</option>}
                {selected.map((item) => (
                  <option key={item.id} value={item.name}>
                    {item.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">
                Medical staff <span className="text-red-600">*</span>
              </label>
              <select
                className="input"
                required
                value={staffId}
                onChange={(e) => setStaffId(e.target.value)}
              >
                <option value="">Select medical staff</option>
                {staff.map((row) => (
                  <option key={row.id} value={row.id}>
                    {staffLabel(row)}
                  </option>
                ))}
              </select>
            </div>
            <div className="reg-queue md:col-span-2">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-white/70">
                  Queue number
                </div>
                <strong>{nextQueue != null ? `Q${nextQueue}` : "Q—"}</strong>
              </div>
              <p className="max-w-[14rem] text-right text-xs text-white/80">
                Assigned when you finalize. Shown on the printed ticket.
              </p>
            </div>
            <div className="md:col-span-2">
              <label className="label">
                Is an appointment <span className="text-red-600">*</span>
              </label>
              <div className="grid grid-cols-2 gap-2">
                {(
                  [
                    [true, "Yes — book a time", "Reserve a slot"],
                    [false, "No — walk-in", "Join today's queue now"],
                  ] as const
                ).map(([flag, label, hint]) => (
                  <button
                    key={String(flag)}
                    type="button"
                    className={`reg-choice ${isAppointment === flag ? "reg-choice--on" : ""}`}
                    onClick={() => {
                      setIsAppointment(flag);
                      if (!flag) setSlotStart("");
                    }}
                  >
                    <span>
                      <span className="block font-semibold">{label}</span>
                      <span className="block text-xs font-normal text-muted">{hint}</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
          {isAppointment ? (
            <div className="space-y-3">
              <div>
                <label className="label">Date</label>
                <input
                  className="input"
                  type="date"
                  value={slotDate}
                  onChange={(e) => {
                    setSlotDate(e.target.value);
                    setSlotStart("");
                  }}
                />
              </div>
              <div>
                <label className="label">Time slot</label>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {slots.map((slot) => (
                    <button
                      key={slot.starts_at}
                      type="button"
                      disabled={!slot.available}
                      className={`reg-slot ${slotStart === slot.starts_at ? "reg-slot--on" : ""} ${
                        slot.available ? "" : "cursor-not-allowed text-muted line-through opacity-50"
                      }`}
                      onClick={() => setSlotStart(slot.starts_at)}
                    >
                      {slotLabel(slot.starts_at)}
                    </button>
                  ))}
                </div>
                {slots.length === 0 && <p className="text-sm text-muted">No slots for this date.</p>}
              </div>
            </div>
          ) : (
            <p className="rounded-xl bg-brand-50 px-3 py-1.5 text-xs text-brand-800">
              Walk-in joins today&apos;s queue under the selected staff. No booked slot.
            </p>
          )}
        </div>
      )}

      {step === 4 && (
        <div className="space-y-2">
          {consent && (
            <p className="rounded-2xl bg-brand-50 px-3 py-2 text-sm text-brand-800">
              Signed by {consent.signed_by_name}
              {consent.guardian ? " (guardian)" : ""} — {consent.procedure_name}
            </p>
          )}
          <ConsentPad
            patientName={
              isMinor(form)
                ? form.guardian_name
                : `${form.first_name} ${form.last_name}`.trim()
            }
            defaultProcedure="Registration, examination and treatment consent"
            defaultGuardian={isMinor(form)}
            onCapture={setConsent}
            captureLabel="Confirm signature"
            onMessage={() => setError("")}
          />
        </div>
      )}

      {step === 5 && (
        <div className="space-y-3">
          <div className="reg-section text-sm">
            <p className="reg-section__title">Review</p>
            <div className="font-display text-xl font-bold text-brand-900">
              {form.first_name} {form.last_name}
            </div>
            <div className="text-muted">{form.chief_complaint || "No visit reason given"}</div>
            <ul className="mt-3 space-y-1">
              {selected.map((item) => (
                <li key={item.id} className="flex justify-between gap-3">
                  <span>{item.name} × {qty[item.id]}</span>
                  <span className="font-semibold">{money(itemPrice(item) * (qty[item.id] || 0))}</span>
                </li>
              ))}
            </ul>
            <div className="mt-3 flex flex-wrap justify-between gap-2 border-t border-brand-100 pt-3 font-bold">
              <span>
                {money(outstanding ? amountPaid : total)} of {money(total)}
              </span>
              <span className="font-normal text-muted">
                {payerType === "self"
                  ? method.replace("_", " ")
                  : payerType === "insurance"
                    ? `Insurance / ${insurer}${insurerName ? ` (${insurerName})` : ""}`
                    : insurerName || "Other"}
              </span>
            </div>
            <p className="mt-2 text-muted">
              Outstanding <strong className="text-brand-900">{outstanding ? "Yes" : "No"}</strong>
              {" · "}
              {serviceName} · {staff.find((row) => row.id === staffId)?.full_name || "no staff"} ·
              Queue Q{nextQueue ?? "—"} · {isAppointment ? `Appointment ${slotStart ? slotLabel(slotStart) : ""}` : "Walk-in"}
              {" · "}
              Consent {consent ? `signed by ${consent.signed_by_name}` : "missing"}
            </p>
          </div>
          <div>
            <label className="label">Send to clinical department</label>
            <div className="grid gap-2 sm:grid-cols-2">
              {DEPARTMENTS.map((d) => (
                <label key={d.id} className={`reg-choice ${department === d.id ? "reg-choice--on" : ""}`}>
                  <input
                    type="radio"
                    name="destination"
                    checked={department === d.id}
                    onChange={() => setDepartment(d.id)}
                  />
                  {d.label}
                </label>
              ))}
            </div>
          </div>
        </div>
      )}

        </div>
        {error && (
          <div className="reg-error">{error}</div>
        )}
        <footer className="reg-actions">
          <div className="reg-draft">
            <div className="reg-draft__actions">
              <button
                type="button"
                className="btn-ghost inline-flex items-center gap-2"
                disabled={draftBusy || !draftReady}
                onClick={async () => {
                  if (!(await saveDraft(step))) return;
                  resetWizard();
                  if (syncUrl) navigate("/front-desk");
                  else onDone();
                }}
              >
                <Save size={16} aria-hidden />
                {draftBusy ? "Saving…" : "Save & finish later"}
              </button>
              {(draftId || draftReady) && (
                <ConfirmAction
                  label="Cancel registration"
                  confirmLabel={draftId ? "Yes, cancel it" : "Yes, clear it"}
                  onConfirm={cancelRegistration}
                />
              )}
            </div>
            <p className="reg-draft__note" role="status" aria-live="polite">
              {draftError ? (
                <span className="font-semibold text-red-700">{draftError}</span>
              ) : draftNote ? (
                <span className="font-semibold text-brand-800">{draftNote}</span>
              ) : draftSavedAt ? (
                `Draft saved ${savedAtLabel(draftSavedAt)} — safe to leave this screen.`
              ) : draftReady ? (
                "Not saved yet. Save it to finish this registration later."
              ) : (
                "Enter the patient name to be able to save an unfinished registration."
              )}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {step > 0 && (
              <button type="button" className="btn-ghost" onClick={() => goTo(step - 1)}>
                Back
              </button>
            )}
            {step < STEP_META.length - 1 ? (
              <button
                type="button"
                className="btn-primary inline-flex items-center gap-2"
                disabled={!canAdvance()}
                onClick={() => {
                  setError("");
                  if (!canAdvance()) return;
                  const next = step + 1;
                  setMaxReached((m) => Math.max(m, next));
                  setStep(next);
                  writeParams(next);
                  void saveDraft(next, true);
                }}
              >
                Continue <ArrowRight size={16} />
              </button>
            ) : (
              <button
                type="button"
                className="btn-primary"
                disabled={!canAdvance() || busy}
                onClick={() => void finalize()}
              >
                {busy ? "Finalizing…" : "Finalize registration"}
              </button>
            )}
          </div>
        </footer>
      </section>
    </div>
  );
}
