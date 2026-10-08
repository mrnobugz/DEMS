/**
 * Shared chair-side clerkship for every Clinical department: today's queue,
 * digital intake, visit exam, and consent — then the department's own
 * operations sit below this block.
 */

import { FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  ClerkshipIntakeFields,
  ageFromDob,
  clerkshipPayload,
  formFromPatient,
  type ClerkshipFormState,
} from "@/components/ClerkshipIntakeFields";
import { ClinicalExamPanel } from "@/components/ClinicalExamPanel";
import { ConsentPad } from "@/components/ConsentPad";
import { ProcedureInvoicePanel } from "@/components/ProcedureInvoicePanel";
import { EmptyState } from "@/components/EmptyState";
import { PatientSafetyBanner } from "@/components/PatientSafetyBanner";
import { ChairsidePharmacy } from "@/components/ChairsidePharmacy";
import { EndoPanel } from "@/components/EndoPanel";
import { RestorativePanel } from "@/components/RestorativePanel";
import { RevealSection } from "@/components/RevealSection";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { hasEffectivePermission } from "@/lib/nav";
import type { ChairQueueItem, Patient, PatientVitalSign } from "@/lib/types";

export type ClinicalDept = "restorative" | "maxillofacial" | "orthodontic" | "paediatric";

const DEPT_CLERKSHIP: Record<ClinicalDept, { exam: string; consent: string }> = {
  restorative: {
    exam: "Hard tissue, pulp tests, restorations, and endodontics",
    consent: "Restorative / crown / RCT consent",
  },
  maxillofacial: {
    exam: "Chief complaint through review of systems, then local exam",
    consent: "Surgical / extraction / implant consent",
  },
  orthodontic: {
    exam: "Skeletal, profile, occlusion, and smile",
    consent: "Orthodontic appliance consent",
  },
  paediatric: {
    exam: "Growth, habits, primary dentition, and behaviour",
    consent: "Paediatric treatment consent (guardian)",
  },
};

export function DepartmentChairwork({
  dept,
  patientId,
  selectedTooth,
}: {
  dept: ClinicalDept;
  patientId?: string;
  selectedTooth?: string | null;
}) {
  const copy = DEPT_CLERKSHIP[dept];
  const user = useAuth((s) => s.user);
  const canPrescribe = user?.effective_permissions?.length
    ? hasEffectivePermission(user.effective_permissions, "pharmacy:*")
    : ["pharmacy", "dentist", "super_admin"].includes(user?.role || "");
  const [appts, setAppts] = useState<ChairQueueItem[]>([]);
  const [patient, setPatient] = useState<Patient | null>(null);
  const [intake, setIntake] = useState<ClerkshipFormState | null>(null);
  const [latestVitals, setLatestVitals] = useState<PatientVitalSign | null>(null);
  const [intakeOpen, setIntakeOpen] = useState(false);
  const [msg, setMsg] = useState("");

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
      setIntakeOpen(false);
      return;
    }
    Promise.all([
      api<Patient>(`/api/v1/patients/${patientId}`),
      api<PatientVitalSign | null>(`/api/v1/patients/${patientId}/vitals/latest`).catch(() => null),
    ])
      .then(([p, vitals]) => {
        const form = formFromPatient(p);
        setPatient(p);
        setIntake(form);
        setLatestVitals(vitals);
        setIntakeOpen(dept === "maxillofacial" || dept === "orthodontic");
      })
      .catch(() => {
        setPatient(null);
        setIntake(null);
        setLatestVitals(null);
      });
  }, [patientId, dept]);

  async function saveIntake(e: FormEvent) {
    e.preventDefault();
    if (!patientId || !intake) return;
    try {
      await api(`/api/v1/patients/${patientId}`, {
        method: "PATCH",
        body: JSON.stringify(clerkshipPayload(intake)),
      });
      setMsg("Clerkship intake saved");
    } catch (err: any) {
      setMsg(err.message ?? "Intake save failed");
    }
  }

  return (
    <div className="space-y-3">
      <section className="glass-panel">
        <div className="mb-1 flex items-baseline justify-between gap-2">
          <h3 className="font-display text-base font-bold text-brand-900">Chair queue</h3>
          <span className="text-xs font-semibold capitalize text-muted">{dept} · today</span>
        </div>
        <p className="text-xs text-muted">
          Registered to this department. Your assigned visits are listed first.
        </p>
        {appts.length === 0 ? (
          <EmptyState
            title="No chair visits queued"
            hint="Finalize registration to this department to populate the queue."
          />
        ) : (
          <QueueList items={appts} userId={user?.id} />
        )}
      </section>

      {!patientId && (
        <p className="text-sm text-muted">
          Open a queued patient after consultation fees. Complete clinical clerkship (history, pain,
          exam), then {dept} operations.
        </p>
      )}

      {patientId && (
        <>
          {msg && <p className="text-sm text-brand-700">{msg}</p>}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold text-brand-900">
              Clerkship · {patient ? `${patient.first_name} ${patient.last_name}` : "patient"}
              <span className="ml-2 font-normal text-muted">{copy.exam}</span>
            </p>
            <Link className="btn-ghost text-xs" to={`/patients/${patientId}`}>
              Full chart
            </Link>
          </div>
          <PatientSafetyBanner patientId={patientId} />

          <RevealSection
            title={
              dept === "maxillofacial"
                ? "Oral maxillofacial surgery"
                : dept === "orthodontic"
                  ? "Orthodontic clerkship"
                  : "Clinical clerkship"
            }
            hint={copy.exam}
            open={intakeOpen}
            onOpenChange={setIntakeOpen}
            showLabel="Show"
          >
            {intake && (
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
                <button className="btn-primary" type="submit">
                  Save intake
                </button>
              </form>
            )}
          </RevealSection>

          <ClinicalExamPanel
            patientId={patientId}
            chiefComplaint={intake?.chief_complaint}
            onMessage={setMsg}
            department={dept}
            defaultOpen
          />

          {dept !== "maxillofacial" && (
          <div className="grid gap-4 lg:grid-cols-2">
            <ProcedureInvoicePanel patientId={patientId} onDone={() => setMsg("Invoice created from procedures")} />
            <ConsentPad
              patientId={patientId}
              patientName={
                patient ? `${patient.first_name} ${patient.last_name}` : undefined
              }
              onMessage={setMsg}
              defaultGuardian={
                dept === "paediatric" ||
                (patient?.date_of_birth ? (ageFromDob(patient.date_of_birth) ?? 99) < 18 : false)
              }
              defaultProcedure={copy.consent}
            />
          </div>
          )}

          {dept === "restorative" && (
            <div className="grid gap-4 lg:grid-cols-2">
              <RestorativePanel patientId={patientId} selectedTooth={selectedTooth ?? null} />
              <EndoPanel patientId={patientId} selectedTooth={selectedTooth ?? null} />
            </div>
          )}
          {canPrescribe && <ChairsidePharmacy patientId={patientId} />}
        </>
      )}
    </div>
  );
}

function QueueList({ items, userId }: { items: ChairQueueItem[]; userId?: string }) {
  const mine = userId ? items.filter((a) => a.dentist_id === userId) : [];
  const rest = userId ? items.filter((a) => a.dentist_id !== userId) : items;
  return (
    <div className="mt-3 space-y-3">
      {mine.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-brand-700">My chair</p>
          <ul className="divide-y divide-brand-100">{mine.map((a) => (
            <QueueRow key={a.id} item={a} mine />
          ))}</ul>
        </div>
      )}
      {rest.length > 0 && (
        <div>
          {mine.length > 0 && (
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">Department</p>
          )}
          <ul className="divide-y divide-brand-100">{rest.map((a) => (
            <QueueRow key={a.id} item={a} />
          ))}</ul>
        </div>
      )}
    </div>
  );
}

function QueueRow({ item, mine }: { item: ChairQueueItem; mine?: boolean }) {
  return (
    <li>
      <Link className="block rounded-xl px-3 py-2 hover:bg-brand-50" to={`?patient=${item.patient_id}`}>
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
