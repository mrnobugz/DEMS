/** Shared plumbing for the four Clinical specialty department pages. */

import { useEffect, useState } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { api } from "@/lib/api";

export type PatientOption = {
  id: string;
  patient_code: string;
  first_name: string;
  last_name: string;
};

export type DepartmentOverview = {
  restorative_open_cases: number;
  restorative_planned: number;
  endo_in_progress: number;
  surgical_open: number;
  surgical_scheduled_week: number;
  ortho_active: number;
  ortho_reviews_due: number;
  paediatric_profiles: number;
  paediatric_fluoride_due: number;
};

export function useQueryPrefill() {
  const [params] = useSearchParams();
  return {
    patientId: params.get("patient") || "",
    tooth: params.get("tooth") || "",
    site: params.get("site") || "",
  };
}

export function usePatientOptions() {
  const [patients, setPatients] = useState<PatientOption[]>([]);
  useEffect(() => {
    api<{ items: PatientOption[] }>("/api/v1/patients?limit=100")
      .then((p) => setPatients(p.items))
      .catch(() => setPatients([]));
  }, []);
  return patients;
}

export function useDepartmentOverview() {
  const [overview, setOverview] = useState<DepartmentOverview | null>(null);
  useEffect(() => {
    api<DepartmentOverview>("/api/v1/specialty/overview")
      .then(setOverview)
      .catch(() => setOverview(null));
  }, []);
  return overview;
}

export function ClinicalDeptSwitcher() {
  const location = useLocation();
  const depts = [
    { to: "/clinical/restorative", label: "Restorative" },
    { to: "/clinical/maxillofacial", label: "Maxillofacial" },
    { to: "/clinical/orthodontic", label: "Orthodontic" },
    { to: "/clinical/paediatric", label: "Paediatric" },
  ];
  return (
    <div className="mt-3 flex flex-wrap gap-1">
      {depts.map((d) => (
        <Link
          key={d.to}
          to={d.to}
          className={`rounded-full px-3 py-1 text-xs font-semibold ${
            location.pathname === d.to
              ? "bg-brand-500 text-white"
              : "border border-brand-100 bg-white text-muted hover:bg-brand-50"
          }`}
        >
          {d.label}
        </Link>
      ))}
    </div>
  );
}

export function DeptHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
        Clinical
      </p>
      <h2 className="font-display text-3xl font-bold text-brand-900">{title}</h2>
      <p className="text-sm text-muted">{subtitle}</p>
      <ClinicalDeptSwitcher />
    </div>
  );
}

export function StatCards({ cards }: { cards: { label: string; value: number | string; alert?: boolean }[] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((c) => (
        <div
          key={c.label}
          className={`glass-panel rounded-3xl p-4 ${c.alert ? "border border-red-200" : ""}`}
        >
          <div
            className={`font-display text-2xl font-bold ${
              c.alert ? "text-red-700" : "text-brand-900"
            }`}
          >
            {c.value}
          </div>
          <div className="text-xs font-semibold text-muted">{c.label}</div>
        </div>
      ))}
    </div>
  );
}

export function PatientSelect({
  patients,
  value,
  onChange,
  label = "Patient",
}: {
  patients: PatientOption[];
  value: string;
  onChange: (id: string) => void;
  label?: string;
}) {
  return (
    <label className="text-sm">
      {label}
      <select
        className="input mt-1"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required
      >
        <option value="">— select patient —</option>
        {patients.map((p) => (
          <option key={p.id} value={p.id}>
            {p.patient_code} · {p.first_name} {p.last_name}
          </option>
        ))}
      </select>
    </label>
  );
}

export function PatientChip({ id, name }: { id: string; name?: string | null }) {
  return (
    <Link to={`/patients/${id}`} className="font-semibold text-brand-700 hover:underline">
      {name || "Patient"}
    </Link>
  );
}

export function prettyLabel(value: string): string {
  return value.replaceAll("_", " ");
}
