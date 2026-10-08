import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ExternalLink, FileDown, Printer } from "lucide-react";
import { Modal } from "@/components/Modal";
import { VitalSignsDetails, vitalsSummary } from "@/components/VitalSignsPanel";
import { api, ApiError } from "@/lib/api";
import { exportRowsToCsv, printRecordSheet, type ExportColumn } from "@/lib/exportTable";
import type { ClinicalRecordDetail, ClinicalVisit } from "@/lib/types";

function dateLabel(value?: string | null) {
  if (!value) return "—";
  const at = new Date(value);
  return Number.isNaN(at.getTime())
    ? value
    : at.toLocaleDateString([], { day: "2-digit", month: "short", year: "numeric" });
}

function statusTone(status?: string | null) {
  if (status === "completed") return "status-pill--success";
  if (status === "cancelled") return "status-pill--danger";
  return "status-pill--info";
}

function ageYears(dob?: string | null) {
  if (!dob) return null;
  const born = new Date(dob);
  if (Number.isNaN(born.getTime())) return null;
  const now = new Date();
  let years = now.getFullYear() - born.getFullYear();
  const beforeBirthday =
    now.getMonth() < born.getMonth() ||
    (now.getMonth() === born.getMonth() && now.getDate() < born.getDate());
  if (beforeBirthday) years -= 1;
  return years >= 0 ? years : null;
}

function titleCase(value?: string | null) {
  if (!value) return "—";
  return value.replaceAll("_", " ").replace(/^./, (c) => c.toUpperCase());
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

/** One line of prose for a visit's exam blocks, so the dialog stays readable. */
function visitFindings(visit: ClinicalVisit): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  const dx = visit.diagnosis;
  if (dx?.working_diagnosis) out.push(["Working diagnosis", dx.working_diagnosis]);
  if (dx?.final_impression) out.push(["Final impression", dx.final_impression]);
  if (dx?.problem_list) out.push(["Problem list", dx.problem_list]);
  if (dx?.icd10_codes?.length) {
    out.push(["ICD-10", dx.icd10_codes.map((c) => `${c.code} ${c.description}`).join("; ")]);
  }
  if (dx?.referrals) out.push(["Referrals", dx.referrals]);
  const vitals = vitalsSummary(visit.vitals);
  if (!vitals.startsWith("No vital")) out.push(["Vitals at visit", vitals]);
  const io = visit.intra_oral;
  const ioBits = [
    io?.decayed_teeth && `decayed ${io.decayed_teeth}`,
    io?.missing_teeth && `missing ${io.missing_teeth}`,
    io?.filled_teeth && `filled ${io.filled_teeth}`,
    io?.occlusion && `occlusion ${io.occlusion}`,
  ].filter(Boolean) as string[];
  if (ioBits.length) out.push(["Intra-oral", ioBits.join(" · ")]);
  if (visit.extra_oral?.notes) out.push(["Extra-oral", visit.extra_oral.notes]);
  const ix = visit.investigations;
  const ixBits = [
    ix?.radiograph_notes,
    ix?.radiology_items?.length ? `${ix.radiology_items.length} radiology item(s)` : null,
    ix?.photography_notes,
  ].filter(Boolean) as string[];
  if (ixBits.length) out.push(["Investigations", ixBits.join(" · ")]);
  return out;
}

const VISIT_CSV: ExportColumn<ClinicalVisit>[] = [
  { key: "visit_date", header: "Visit date", value: (v) => v.visit_date },
  { key: "status", header: "Status", value: (v) => v.status },
  { key: "complaint", header: "Chief complaint", value: (v) => v.chief_complaint || "" },
  { key: "diagnosis", header: "Working diagnosis", value: (v) => v.diagnosis?.working_diagnosis || "" },
  { key: "impression", header: "Final impression", value: (v) => v.diagnosis?.final_impression || "" },
  { key: "vitals", header: "Vitals", value: (v) => vitalsSummary(v.vitals) },
  { key: "notes", header: "Notes", value: (v) => v.notes || "" },
];

/** Read-only preview of one patient's clinical file, opened from the register. */
export function ClinicalRecordDialog({
  patientId,
  onClose,
}: {
  patientId: string;
  onClose: () => void;
}) {
  const [detail, setDetail] = useState<ClinicalRecordDetail | null>(null);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");

  useEffect(() => {
    let alive = true;
    setDetail(null);
    setError("");
    api<ClinicalRecordDetail>(`/api/v1/clinical-records/${patientId}`)
      .then((data) => {
        if (alive) setDetail(data);
      })
      .catch((err) => {
        if (alive) setError(err instanceof ApiError ? err.message : "Could not open this record");
      });
    return () => {
      alive = false;
    };
  }, [patientId]);

  const patient = detail?.patient;
  const name = patient
    ? [patient.first_name, patient.middle_name, patient.last_name].filter(Boolean).join(" ")
    : "Clinical record";

  const identity = useMemo<Array<[string, string]>>(() => {
    if (!patient || !detail) return [];
    const age = ageYears(patient.date_of_birth);
    return [
      ["File number", patient.patient_code],
      ["Sex / age", `${titleCase(patient.sex)}${age != null ? ` · ${age} yrs` : ""}`],
      ["Telephone", patient.phone || "—"],
      ["Town / city", patient.town_city || "—"],
      ["Department", titleCase(patient.destination_department)],
      ["Primary clinician", patient.primary_dentist_name || "Unassigned"],
      ["Visits", String(detail.summary.visit_count)],
      ["First seen", dateLabel(detail.summary.first_visit_date)],
      ["Last seen", dateLabel(detail.summary.last_visit_date)],
      ["Treatment plans", String(detail.summary.treatment_plan_count)],
      ["Balance", patient.has_outstanding ? "Outstanding" : "Settled"],
    ];
  }, [patient, detail]);

  function printSummary() {
    if (!detail || !patient) return;
    try {
      printRecordSheet({
        title: `Clinical record — ${name}`,
        meta: [patient.patient_code, `${detail.summary.visit_count} visit(s)`, `Printed ${new Date().toLocaleString()}`],
        sections: [
          { heading: "Patient", rows: identity },
          {
            heading: "Latest vital signs",
            rows: [],
            body: vitalsSummary(detail.latest_vitals),
          },
          ...detail.visits.map((visit) => ({
            heading: `Visit ${dateLabel(visit.visit_date)} — ${titleCase(visit.status)}`,
            rows: [
              ["Chief complaint", visit.chief_complaint || "—"] as [string, string],
              [
                "Examiner",
                (visit.examiner_id && detail.examiner_names[visit.examiner_id]) || "—",
              ] as [string, string],
              ...visitFindings(visit),
            ],
            body: visit.notes || undefined,
          })),
        ],
        footNote: "Confidential clinical record. Handle per clinic data policy.",
      });
      setNote("Print view opened — choose your printer or Save as PDF.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not open the print view");
    }
  }

  function exportVisits() {
    if (!detail || !patient) return;
    exportRowsToCsv(`clinical-record-${patient.patient_code}`, detail.visits, VISIT_CSV);
    setNote(`Exported ${detail.visits.length} visit row(s) to CSV.`);
  }

  return (
    <Modal
      title={name}
      subtitle={
        detail
          ? `${detail.patient.patient_code} · ${detail.summary.visit_count} visit(s) · last seen ${dateLabel(detail.summary.last_visit_date)}`
          : "Loading record…"
      }
      onClose={onClose}
      headerActions={
        detail && (
          <>
            <button type="button" className="btn-ghost text-sm inline-flex items-center gap-2" onClick={exportVisits}>
              <FileDown size={16} aria-hidden /> CSV
            </button>
            <button type="button" className="btn-ghost text-sm inline-flex items-center gap-2" onClick={printSummary}>
              <Printer size={16} aria-hidden /> Print
            </button>
          </>
        )
      }
      footer={
        <>
          <p className="mr-auto text-sm text-muted" role="status" aria-live="polite">
            {error ? <span className="font-semibold text-red-700">{error}</span> : note}
          </p>
          <button type="button" className="btn-ghost" onClick={onClose}>
            Close
          </button>
          {patient && (
            <Link className="btn-primary inline-flex items-center gap-2" to={`/patients/${patient.id}`}>
              Open full file <ExternalLink size={16} aria-hidden />
            </Link>
          )}
        </>
      }
    >
      {!detail && !error && <p className="text-sm text-muted">Loading the clinical record…</p>}
      {error && !detail && <p className="text-sm font-semibold text-red-700">{error}</p>}
      {detail && patient && (
        <div className="space-y-3">
          <section className="reg-section">
            <h3 className="reg-section__title">Patient</h3>
            <dl className="rec-facts">
              {identity.map(([label, value]) => (
                <Fact key={label} label={label} value={value} />
              ))}
            </dl>
            {patient.chief_complaint && (
              <p className="mt-2 text-sm text-muted">Reason on file: {patient.chief_complaint}</p>
            )}
          </section>

          <VitalSignsDetails reading={detail.latest_vitals ?? null} />

          <section>
            <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="font-display text-base font-bold text-brand-900">Visit history</h3>
              <span className="text-xs font-semibold text-muted">
                {detail.visits.length} visit{detail.visits.length === 1 ? "" : "s"} · newest first
              </span>
            </div>
            {detail.visits.length === 0 ? (
              <p className="text-sm text-muted">No clinical visits recorded on this file yet.</p>
            ) : (
              <div className="rec-timeline">
                {detail.visits.map((visit, index) => (
                  <details key={visit.id} className="rec-visit" open={index === 0}>
                    <summary>
                      <span className="font-semibold text-brand-900">{dateLabel(visit.visit_date)}</span>
                      <span className={`status-pill ${statusTone(visit.status)}`}>
                        {titleCase(visit.status)}
                      </span>
                      <span className="text-xs text-muted">
                        {visit.chief_complaint || "No complaint recorded"}
                        {visit.examiner_id && detail.examiner_names[visit.examiner_id]
                          ? ` · ${detail.examiner_names[visit.examiner_id]}`
                          : ""}
                      </span>
                    </summary>
                    <dl className="rec-facts mt-2">
                      {visitFindings(visit).map(([label, value]) => (
                        <Fact key={label} label={label} value={value} />
                      ))}
                    </dl>
                    {visit.notes && <p className="mt-2 text-sm text-ink">{visit.notes}</p>}
                    {visitFindings(visit).length === 0 && !visit.notes && (
                      <p className="mt-2 text-sm text-muted">
                        No exam findings were saved for this visit.
                      </p>
                    )}
                  </details>
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </Modal>
  );
}
