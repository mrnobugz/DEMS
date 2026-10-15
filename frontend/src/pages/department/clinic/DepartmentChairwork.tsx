/**
 * Shared chair-side visit flow for every Clinical department:
 * progressive steps (queue → safety → intake → exam → plan → treat).
 */

import { FormEvent, useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  ClerkshipIntakeFields,
  ageFromDob,
  clerkshipPayload,
  formFromPatient,
  type ClerkshipFormState,
} from "@/components/ClerkshipIntakeFields";
import { ClinicalExamPanel } from "@/components/ClinicalExamPanel";
import { ClinicalVisitStepper, type VisitStepDef } from "@/components/ClinicalVisitStepper";
import { ConsentPad } from "@/components/ConsentPad";
import { ProcedureInvoicePanel } from "@/components/ProcedureInvoicePanel";
import { EmptyState } from "@/components/EmptyState";
import { Modal } from "@/components/Modal";
import { PatientSafetyBanner } from "@/components/PatientSafetyBanner";
import { ChairsidePharmacy } from "@/components/ChairsidePharmacy";
import { EndoPanel } from "@/components/EndoPanel";
import { RestorativePanel } from "@/components/RestorativePanel";
import { VitalSignsDetails } from "@/components/VitalSignsPanel";
import { ConfigStatus } from "@/components/config/ConfigUi";
import { useAnnounce } from "@/components/ui/sonner";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { hasEffectivePermission } from "@/lib/nav";
import type { ChairQueueItem, Patient, PatientVitalSign } from "@/lib/types";

export type ClinicalDept = "restorative" | "maxillofacial" | "orthodontic" | "paediatric";

const DEPT_CLERKSHIP: Record<ClinicalDept, { exam: string; consent: string; treat: string }> = {
  restorative: {
    exam: "Hard tissue, pulp tests, restorations, and endodontics",
    consent: "Restorative / crown / RCT consent",
    treat: "Open cases, restorations, endodontics, and chairside Rx",
  },
  maxillofacial: {
    exam: "Chief complaint through review of systems, then local exam",
    consent: "Surgical / extraction / implant consent",
    treat: "Surgical plan, site charting, and post-op follow-up",
  },
  orthodontic: {
    exam: "Skeletal, profile, occlusion, and smile",
    consent: "Orthodontic appliance consent",
    treat: "Appliance assessment, adjustments, and review cadence",
  },
  paediatric: {
    exam: "Growth, habits, primary dentition, and behaviour",
    consent: "Paediatric treatment consent (guardian)",
    treat: "Behaviour, caries risk, fluoride, and primary care",
  },
};

type Props = {
  dept: ClinicalDept;
  patientId?: string;
  selectedTooth?: string | null;
  /** Extra controls under the chair queue (e.g. patient search picker) */
  queueSlot?: ReactNode;
  /** Odontogram / chart tools for step 4 */
  chartSlot?: ReactNode;
  /** Specialty ops for step 6 (forms) */
  treatSlot?: ReactNode;
  /** Optional board below the visit (case lists) */
  boardSlot?: ReactNode;
};

export function DepartmentChairwork({
  dept,
  patientId,
  selectedTooth,
  queueSlot,
  chartSlot,
  treatSlot,
  boardSlot,
}: Props) {
  const copy = DEPT_CLERKSHIP[dept];
  const user = useAuth((s) => s.user);
  const canPrescribe = user?.effective_permissions?.length
    ? hasEffectivePermission(user.effective_permissions, "pharmacy:*")
    : ["pharmacy", "dentist", "super_admin"].includes(user?.role || "");

  const [appts, setAppts] = useState<ChairQueueItem[]>([]);
  const [patient, setPatient] = useState<Patient | null>(null);
  const [intake, setIntake] = useState<ClerkshipFormState | null>(null);
  const [latestVitals, setLatestVitals] = useState<PatientVitalSign | null>(null);
  const [loadingPatient, setLoadingPatient] = useState(false);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const [step, setStep] = useState(0);
  const [completed, setCompleted] = useState<Set<number>>(() => new Set());
  const [consentOpen, setConsentOpen] = useState(false);
  const [rxOpen, setRxOpen] = useState(false);
  const [savingIntake, setSavingIntake] = useState(false);

  useAnnounce(error);
  useAnnounce(msg);

  const steps: VisitStepDef[] = useMemo(
    () => [
      {
        id: "queue",
        title: "Select patient",
        hint: "Open today’s chair visit to start the clerkship.",
      },
      {
        id: "safety",
        title: "Safety & vitals",
        hint: "Review alerts and the latest nursing vitals before exam.",
      },
      {
        id: "intake",
        title: "Clerkship intake",
        hint: copy.exam,
      },
      {
        id: "exam",
        title: "Exam & chart",
        hint: "Record the visit exam and mark the chart for this tooth/site.",
      },
      {
        id: "plan",
        title: "Plan & consent",
        hint: "Confirm the plan, capture consent, then bill when ready.",
      },
      {
        id: "treat",
        title: "Treat & bill",
        hint: copy.treat,
      },
    ],
    [copy.exam, copy.treat],
  );

  useEffect(() => {
    let alive = true;
    async function loadQueue() {
      try {
        const rows = await api<ChairQueueItem[]>(
          `/api/v1/departments/today-appointments?department=${dept}`,
        );
        if (alive) setAppts(rows);
      } catch {
        if (alive) setAppts([]);
      }
    }
    void loadQueue();
    const tick = window.setInterval(() => void loadQueue(), 20000);
    return () => {
      alive = false;
      window.clearInterval(tick);
    };
  }, [dept]);

  useEffect(() => {
    if (!patientId) {
      setPatient(null);
      setIntake(null);
      setLatestVitals(null);
      setStep(0);
      setCompleted(new Set());
      setConsentOpen(false);
      setRxOpen(false);
      setMsg("");
      setError("");
      return;
    }
    setLoadingPatient(true);
    setError("");
    Promise.all([
      api<Patient>(`/api/v1/patients/${patientId}`),
      api<PatientVitalSign | null>(`/api/v1/patients/${patientId}/vitals/latest`).catch(() => null),
    ])
      .then(([p, vitals]) => {
        setPatient(p);
        setIntake(formFromPatient(p));
        setLatestVitals(vitals);
        // Patient selected → mark queue done and open safety
        setCompleted(new Set([0]));
        setStep(1);
      })
      .catch((err: any) => {
        setPatient(null);
        setIntake(null);
        setLatestVitals(null);
        setError(err?.message ?? "Could not load patient");
      })
      .finally(() => setLoadingPatient(false));
  }, [patientId]);

  function markDoneAndAdvance(from: number) {
    setCompleted((prev) => {
      const next = new Set(prev);
      next.add(from);
      return next;
    });
    setStep(Math.min(from + 1, steps.length - 1));
    setMsg("");
  }

  async function saveIntake(e: FormEvent) {
    e.preventDefault();
    if (!patientId || !intake) return;
    setSavingIntake(true);
    setError("");
    try {
      await api(`/api/v1/patients/${patientId}`, {
        method: "PATCH",
        body: JSON.stringify(clerkshipPayload(intake)),
      });
      setMsg("Clerkship intake saved");
      markDoneAndAdvance(2);
    } catch (err: any) {
      setError(err.message ?? "Intake save failed");
    } finally {
      setSavingIntake(false);
    }
  }

  const patientLabel = patient
    ? `${patient.first_name} ${patient.last_name}`
    : patientId
      ? "Loading…"
      : null;

  const needsGuardian =
    dept === "paediatric" ||
    (patient?.date_of_birth ? (ageFromDob(patient.date_of_birth) ?? 99) < 18 : false);

  return (
    <div className="space-y-3">
      <ClinicalVisitStepper
        steps={steps}
        current={step}
        completed={completed}
        onSelect={setStep}
        eyebrow={
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                {dept} visit
              </p>
              {patientLabel && (
                <p className="truncate text-sm font-semibold text-brand-900">
                  {patientLabel}
                  {patient?.patient_code ? (
                    <span className="ml-2 font-mono text-xs font-normal text-muted">
                      {patient.patient_code}
                    </span>
                  ) : null}
                </p>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {selectedTooth?.trim() ? (
                <span
                  className="inline-flex min-h-[var(--touch-min)] items-center rounded-xl border border-brand-200 bg-brand-50 px-3 text-xs font-bold text-brand-900 dark:border-brand-800 dark:bg-brand-950/40 dark:text-brand-100"
                  title="Selected on the odontogram — used for billing, radiology, and treatment"
                >
                  Tooth {selectedTooth.trim()}
                </span>
              ) : null}
              {patientId && (
                <Link
                  className="btn-ghost min-h-[var(--touch-min)] px-3 text-xs"
                  to={`/patients/${patientId}`}
                >
                  Full chart
                </Link>
              )}
            </div>
          </div>
        }
      >
        <ConfigStatus loading={loadingPatient} error={error} ok={msg} />

        {/* 1 · Select patient */}
        {step === 0 && (
          <div className="space-y-3">
            <p className="text-sm text-muted">
              Registered visits for this department. Your assigned chairs are listed first. Open a
              patient to continue.
            </p>
            {appts.length === 0 ? (
              <EmptyState
                title="No chair visits queued"
                hint="Finalize registration to this department, or pick a patient below."
              />
            ) : (
              <QueueList items={appts} userId={user?.id} activePatientId={patientId} />
            )}
            {queueSlot}
            {patientId && (
              <div className="visit-stepper__actions">
                <button
                  type="button"
                  className="btn-primary min-h-[var(--touch-min)]"
                  onClick={() => markDoneAndAdvance(0)}
                >
                  Continue with this patient
                </button>
              </div>
            )}
          </div>
        )}

        {/* 2 · Safety & vitals */}
        {step === 1 && patientId && (
          <div className="space-y-3">
            <PatientSafetyBanner patientId={patientId} />
            <div className="rounded-xl border border-border/50 bg-surface-elevated/40 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">Latest vitals</p>
              <div className="mt-2">
                <VitalSignsDetails
                  reading={latestVitals}
                  hint="Recorded by nursing. Continue after you have reviewed alerts and vitals."
                />
              </div>
            </div>
            <div className="visit-stepper__actions">
              <button
                type="button"
                className="btn-ghost min-h-[var(--touch-min)]"
                onClick={() => setStep(0)}
              >
                Back
              </button>
              <button
                type="button"
                className="btn-primary min-h-[var(--touch-min)]"
                onClick={() => markDoneAndAdvance(1)}
              >
                Save & continue
              </button>
            </div>
          </div>
        )}

        {/* 3 · Clerkship intake */}
        {step === 2 && patientId && intake && (
          <form className="space-y-3" onSubmit={saveIntake}>
            <ClerkshipIntakeFields
              key={patientId}
              form={intake}
              onChange={setIntake}
              mode="edit"
              variant="clinical"
              department={dept}
              latestVitals={latestVitals}
            />
            <div className="visit-stepper__actions">
              <button
                type="button"
                className="btn-ghost min-h-[var(--touch-min)]"
                onClick={() => setStep(1)}
              >
                Back
              </button>
              <button
                type="submit"
                className="btn-primary min-h-[var(--touch-min)]"
                disabled={savingIntake}
              >
                {savingIntake ? "Saving…" : "Save & continue"}
              </button>
            </div>
          </form>
        )}

        {/* 4 · Exam & chart */}
        {step === 3 && patientId && (
          <div className="space-y-3">
            <ClinicalExamPanel
              patientId={patientId}
              chiefComplaint={intake?.chief_complaint}
              selectedTooth={selectedTooth}
              onMessage={(m) => {
                setMsg(m);
                if (/saved|updated/i.test(m)) {
                  setCompleted((prev) => new Set(prev).add(3));
                }
              }}
              department={dept}
              defaultOpen
            />
            {chartSlot}
            {!selectedTooth?.trim() && (
              <p className="text-xs text-amber-800 dark:text-amber-200" role="status">
                Tip: tap a tooth on the odontogram so billing and radiology use that tooth in later steps.
              </p>
            )}
            <div className="visit-stepper__actions">
              <button
                type="button"
                className="btn-ghost min-h-[var(--touch-min)]"
                onClick={() => setStep(2)}
              >
                Back
              </button>
              <button
                type="button"
                className="btn-primary min-h-[var(--touch-min)]"
                onClick={() => markDoneAndAdvance(3)}
              >
                Save & continue
              </button>
            </div>
          </div>
        )}

        {/* 5 · Plan & consent */}
        {step === 4 && patientId && (
          <div className="space-y-3">
            <p className="text-sm text-muted">
              Open consent or billing only when needed — they stay out of the way until you call them.
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                className="btn-ghost min-h-[var(--touch-min)] justify-start px-4 text-left"
                onClick={() => setConsentOpen(true)}
              >
                <span className="block text-sm font-semibold text-ink">Capture consent</span>
                <span className="block text-xs text-muted">{copy.consent}</span>
              </button>
              <ProcedureInvoicePanel
                patientId={patientId}
                defaultTooth={selectedTooth}
                onDone={() => setMsg("Invoice created from procedures")}
                title="Bill procedures"
                hint="Fee-schedule items for this visit"
              />
            </div>
            {!selectedTooth?.trim() && (
              <p className="text-xs text-muted">
                No chart tooth yet — go back to Exam & chart and select a tooth, or enter teeth on each invoice line.
              </p>
            )}
            <div className="visit-stepper__actions">
              <button
                type="button"
                className="btn-ghost min-h-[var(--touch-min)]"
                onClick={() => setStep(3)}
              >
                Back
              </button>
              <button
                type="button"
                className="btn-primary min-h-[var(--touch-min)]"
                onClick={() => markDoneAndAdvance(4)}
              >
                Save & continue
              </button>
            </div>
          </div>
        )}

        {/* 6 · Treat & bill */}
        {step === 5 && patientId && (
          <div className="space-y-3">
            {dept === "restorative" && (
              <div className="grid gap-3 lg:grid-cols-2">
                <RestorativePanel patientId={patientId} selectedTooth={selectedTooth ?? null} />
                <EndoPanel patientId={patientId} selectedTooth={selectedTooth ?? null} />
              </div>
            )}
            {treatSlot}
            <div className="flex flex-wrap gap-2">
              {canPrescribe && (
                <button
                  type="button"
                  className="btn-ghost min-h-[var(--touch-min)]"
                  onClick={() => setRxOpen(true)}
                >
                  Prescribe / Rx
                </button>
              )}
              <ProcedureInvoicePanel
                patientId={patientId}
                defaultTooth={selectedTooth}
                onDone={() => setMsg("Invoice created from procedures")}
              />
            </div>
            <div className="visit-stepper__actions">
              <button
                type="button"
                className="btn-ghost min-h-[var(--touch-min)]"
                onClick={() => setStep(4)}
              >
                Back
              </button>
              <button
                type="button"
                className="btn-primary min-h-[var(--touch-min)]"
                onClick={() => {
                  markDoneAndAdvance(5);
                  setMsg("Visit steps complete — you can review any step above.");
                }}
              >
                Finish visit steps
              </button>
            </div>
          </div>
        )}

        {step > 0 && !patientId && (
          <EmptyState
            title="Select a patient first"
            hint="Choose someone from the chair queue to continue the visit."
            action={
              <button type="button" className="btn-primary min-h-[var(--touch-min)]" onClick={() => setStep(0)}>
                Go to queue
              </button>
            }
          />
        )}
      </ClinicalVisitStepper>

      {boardSlot}

      {consentOpen && patientId && (
        <Modal
          title="Treatment consent"
          subtitle={copy.consent}
          size="wide"
          onClose={() => setConsentOpen(false)}
        >
          <ConsentPad
            patientId={patientId}
            patientName={patientLabel || undefined}
            onMessage={(m) => {
              setMsg(m);
              if (/saved|signed|consent/i.test(m)) setConsentOpen(false);
            }}
            defaultGuardian={needsGuardian}
            defaultProcedure={copy.consent}
          />
        </Modal>
      )}

      {rxOpen && patientId && canPrescribe && (
        <Modal
          title="Chairside prescription"
          subtitle="Prescribe from the chair. Dispensing happens in Pharmacy."
          size="wide"
          onClose={() => setRxOpen(false)}
        >
          <ChairsidePharmacy patientId={patientId} />
        </Modal>
      )}
    </div>
  );
}

function QueueList({
  items,
  userId,
  activePatientId,
}: {
  items: ChairQueueItem[];
  userId?: string;
  activePatientId?: string;
}) {
  const mine = userId ? items.filter((a) => a.dentist_id === userId) : [];
  const rest = userId ? items.filter((a) => a.dentist_id !== userId) : items;
  return (
    <div className="space-y-3">
      {mine.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-brand-700">My chair</p>
          <ul className="mt-1 divide-y divide-brand-100">
            {mine.map((a) => (
              <QueueRow key={a.id} item={a} mine active={a.patient_id === activePatientId} />
            ))}
          </ul>
        </div>
      )}
      {rest.length > 0 && (
        <div>
          {mine.length > 0 && (
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">Department</p>
          )}
          <ul className="mt-1 divide-y divide-brand-100">
            {rest.map((a) => (
              <QueueRow key={a.id} item={a} active={a.patient_id === activePatientId} />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function QueueRow({
  item,
  mine,
  active,
}: {
  item: ChairQueueItem;
  mine?: boolean;
  active?: boolean;
}) {
  return (
    <li>
      <Link
        className={`block min-h-[var(--touch-min)] rounded-xl px-3 py-2.5 hover:bg-brand-50 ${
          active ? "bg-brand-50 ring-1 ring-brand-300" : ""
        }`}
        to={`?patient=${item.patient_id}`}
      >
        {item.queue_number != null && (
          <span className="mr-2 font-mono text-xs font-bold text-brand-700">Q{item.queue_number}</span>
        )}
        <span className="font-semibold">{item.patient_name || item.patient_code || "Patient"}</span>
        <span className="ml-2 text-xs text-muted">
          {item.service_name || item.reason || "Visit"}
          {item.dentist_name ? ` · ${item.dentist_name}` : ""}
        </span>
        <span className="ml-2 text-xs text-muted">
          {item.is_appointment === false ? "Walk-in" : "Appointment"}
        </span>
        {mine && <span className="ml-2 text-xs font-semibold text-brand-700">Yours</span>}
        <span className="ml-2 text-xs text-muted capitalize">{item.status.replaceAll("_", " ")}</span>
      </Link>
    </li>
  );
}
