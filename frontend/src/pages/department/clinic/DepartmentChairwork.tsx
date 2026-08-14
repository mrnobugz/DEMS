/**
 * Shared chair-side clerkship for every Clinical department: today's queue,
 * digital intake, visit exam, SOAP, and consent — then the department's own
 * operations sit below this block.
 */

import { FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  ClerkshipIntakeFields,
  clerkshipPayload,
  formFromPatient,
  type ClerkshipFormState,
} from "@/components/ClerkshipIntakeFields";
import { ClinicalExamPanel } from "@/components/ClinicalExamPanel";
import { ConsentPad } from "@/components/ConsentPad";
import { EmptyState } from "@/components/EmptyState";
import { EndoPanel } from "@/components/EndoPanel";
import { RestorativePanel } from "@/components/RestorativePanel";
import { api } from "@/lib/api";
import type { Patient } from "@/lib/types";

export type ClinicalDept = "restorative" | "maxillofacial" | "orthodontic" | "paediatric";

const DEPT_CLERKSHIP: Record<ClinicalDept, { exam: string; consent: string }> = {
  restorative: {
    exam: "Hard tissue, pulp tests, restorations, and endodontics",
    consent: "Restorative / crown / RCT consent",
  },
  maxillofacial: {
    exam: "Extra-oral, TMJ, lymph nodes, and surgical sites",
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

type Appt = {
  id: string;
  patient_id: string;
  reason?: string | null;
  status: string;
  starts_at?: string;
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
  const [appts, setAppts] = useState<Appt[]>([]);
  const [patient, setPatient] = useState<Patient | null>(null);
  const [intake, setIntake] = useState<ClerkshipFormState | null>(null);
  const [intakeOpen, setIntakeOpen] = useState(false);
  const [msg, setMsg] = useState("");
  const [note, setNote] = useState({ subjective: "", objective: "", assessment: "", plan: "" });

  useEffect(() => {
    api<Appt[]>("/api/v1/departments/today-appointments").then(setAppts).catch(() => setAppts([]));
  }, []);

  useEffect(() => {
    if (!patientId) {
      setPatient(null);
      setIntake(null);
      return;
    }
    api<Patient>(`/api/v1/patients/${patientId}`)
      .then((p) => {
        setPatient(p);
        setIntake(formFromPatient(p));
      })
      .catch(() => {
        setPatient(null);
        setIntake(null);
      });
  }, [patientId]);

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

  async function saveNote(e: FormEvent) {
    e.preventDefault();
    if (!patientId) return;
    try {
      await api(`/api/v1/clinical/patients/${patientId}/notes`, {
        method: "POST",
        body: JSON.stringify(note),
      });
      setNote({ subjective: "", objective: "", assessment: "", plan: "" });
      setMsg("SOAP note saved");
    } catch (err: any) {
      setMsg(err.message ?? "Note save failed");
    }
  }

  async function draftSoap() {
    try {
      const draft = await api<{
        subjective: string;
        objective: string;
        assessment: string;
        plan: string;
      }>("/api/v1/ai/soap-draft", {
        method: "POST",
        body: JSON.stringify({
          chief_complaint: note.subjective || intake?.chief_complaint || `${copy.exam}`,
          findings: note.objective || undefined,
        }),
      });
      setNote({
        subjective: draft.subjective,
        objective: draft.objective,
        assessment: draft.assessment,
        plan: draft.plan,
      });
    } catch (err: any) {
      setMsg(err.message ?? "AI draft failed");
    }
  }

  return (
    <div className="space-y-4">
      <section className="glass-panel rounded-3xl p-5">
        <h3 className="font-display text-lg font-bold text-brand-900">Chair queue · today</h3>
        <p className="text-xs text-muted">Open a visit into this Clinical department</p>
        {appts.length === 0 ? (
          <EmptyState title="No chair visits queued" hint="Book from the schedule." />
        ) : (
          <ul className="mt-3 divide-y divide-brand-100">
            {appts.map((a) => (
              <li key={a.id}>
                <Link
                  className="block rounded-xl px-3 py-2 hover:bg-brand-50"
                  to={`?patient=${a.patient_id}`}
                >
                  <span className="font-semibold">{a.reason || "Visit"}</span>
                  <span className="ml-2 text-xs text-muted capitalize">
                    {a.status.replaceAll("_", " ")}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {!patientId && (
        <p className="text-sm text-muted">
          Select a patient on this department form to open the full clerkship (intake, exam, SOAP,
          consent) plus {dept} operations.
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

          <section className="glass-panel rounded-3xl p-5">
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-display text-lg font-bold">Digital Clerkship intake</h3>
              <button
                type="button"
                className="btn-ghost text-xs"
                onClick={() => setIntakeOpen((v) => !v)}
              >
                {intakeOpen ? "Hide intake" : "Edit clerkship intake"}
              </button>
            </div>
            {intakeOpen && intake && (
              <form className="mt-3 space-y-3" onSubmit={saveIntake}>
                <ClerkshipIntakeFields form={intake} onChange={setIntake} mode="edit" />
                <button className="btn-primary" type="submit">
                  Save intake
                </button>
              </form>
            )}
          </section>

          <ClinicalExamPanel
            patientId={patientId}
            chiefComplaint={intake?.chief_complaint}
            onMessage={setMsg}
            department={dept}
            defaultOpen
          />

          <div className="grid gap-4 lg:grid-cols-2">
            <form className="glass-panel space-y-3 rounded-3xl p-5" onSubmit={saveNote}>
              <div className="flex items-center justify-between">
                <h3 className="font-display text-lg font-bold">SOAP clinical note</h3>
                <button type="button" className="btn-ghost text-xs" onClick={() => void draftSoap()}>
                  AI draft
                </button>
              </div>
              {(["subjective", "objective", "assessment", "plan"] as const).map((field) => (
                <div key={field}>
                  <label className="label capitalize">{field}</label>
                  <textarea
                    className="input min-h-16"
                    value={note[field]}
                    onChange={(e) => setNote({ ...note, [field]: e.target.value })}
                  />
                </div>
              ))}
              <button className="btn-primary" type="submit">
                Save note
              </button>
            </form>
            <ConsentPad
              patientId={patientId}
              patientName={
                patient ? `${patient.first_name} ${patient.last_name}` : undefined
              }
              onMessage={setMsg}
              defaultGuardian={dept === "paediatric"}
              defaultProcedure={copy.consent}
            />
          </div>

          {dept === "restorative" && (
            <div className="grid gap-4 lg:grid-cols-2">
              <RestorativePanel patientId={patientId} selectedTooth={selectedTooth ?? null} />
              <EndoPanel patientId={patientId} selectedTooth={selectedTooth ?? null} />
            </div>
          )}
        </>
      )}
    </div>
  );
}
