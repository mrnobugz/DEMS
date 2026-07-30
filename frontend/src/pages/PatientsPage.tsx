import { FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Search, UserPlus, Users } from "lucide-react";
import {
  ClerkshipIntakeFields,
  clerkshipPayload,
  emptyClerkshipForm,
  type ClerkshipFormState,
} from "@/components/ClerkshipIntakeFields";
import { EmptyState } from "@/components/EmptyState";
import { api, ApiError } from "@/lib/api";
import type { Page, Patient } from "@/lib/types";

export function PatientsPage() {
  const [q, setQ] = useState("");
  const [patients, setPatients] = useState<Patient[]>([]);
  const [total, setTotal] = useState(0);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState<ClerkshipFormState>(emptyClerkshipForm);

  async function load(search = q) {
    const data = await api<Page<Patient>>(
      `/api/v1/patients?limit=50&q=${encodeURIComponent(search)}`,
    );
    setPatients(data.items);
    setTotal(data.total);
  }

  useEffect(() => {
    void load("");
  }, []);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setError("");
    try {
      await api("/api/v1/patients", {
        method: "POST",
        body: JSON.stringify(clerkshipPayload(form)),
      });
      setShowForm(false);
      setForm(emptyClerkshipForm());
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create patient");
    }
  }

  return (
    <div className="space-y-5 animate-rise">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl font-bold text-brand-900">Patients</h2>
          <p className="text-sm text-muted">
            {total} records · Digital Clerkship intake · unique IDs across chart & billing
          </p>
        </div>
        <button className="btn-primary inline-flex items-center gap-2" onClick={() => setShowForm((v) => !v)}>
          <UserPlus size={16} /> New patient
        </button>
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" size={18} />
        <input
          className="input pl-10"
          placeholder="Search name, phone, ID, hospital reg, city…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void load();
          }}
        />
      </div>

      {showForm && (
        <form className="glass-panel space-y-4 rounded-3xl p-5" onSubmit={onCreate}>
          <div>
            <h3 className="font-display text-lg font-bold text-brand-900">Register patient</h3>
            <p className="text-sm text-muted">
              Demographics, anamnesis, pain assessment — replaces paper clerkship forms.
            </p>
          </div>
          <ClerkshipIntakeFields form={form} onChange={setForm} mode="create" />
          {error && <div className="text-sm text-red-600">{error}</div>}
          <button className="btn-primary">Register patient</button>
        </form>
      )}

      <div className="glass-panel overflow-hidden rounded-3xl">
        {patients.length === 0 ? (
          <div className="p-4">
            <EmptyState
              title="No patients yet"
              hint="Register the first patient to start charting and billing."
              icon={Users}
              action={
                <button type="button" className="btn-primary" onClick={() => setShowForm(true)}>
                  New patient
                </button>
              }
            />
          </div>
        ) : (
        <table className="w-full text-left text-sm">
          <thead className="bg-brand-50 text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="px-4 py-3">ID</th>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Complaint</th>
              <th className="px-4 py-3">Phone</th>
              <th className="px-4 py-3">Risk</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {patients.map((p) => (
              <tr key={p.id} className="border-t border-brand-50">
                <td className="px-4 py-3 font-mono text-xs text-brand-700">
                  <div>{p.patient_code}</div>
                  {p.hospital_reg_number && (
                    <div className="text-[10px] text-muted">{p.hospital_reg_number}</div>
                  )}
                </td>
                <td className="px-4 py-3 font-semibold">
                  {p.first_name} {p.last_name}
                </td>
                <td className="max-w-[14rem] truncate px-4 py-3 text-muted">
                  {p.chief_complaint || "—"}
                </td>
                <td className="px-4 py-3 text-muted">{p.phone || "—"}</td>
                <td className="px-4 py-3">
                  {p.caries_risk_score != null ? (
                    <span
                      className={`status-pill ${
                        p.caries_risk_score >= 0.6
                          ? "status-pill--danger"
                          : p.caries_risk_score >= 0.35
                            ? "status-pill--warning"
                            : "status-pill--success"
                      }`}
                    >
                      {(p.caries_risk_score * 100).toFixed(0)}%
                    </span>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  <Link className="font-semibold text-brand-600" to={`/patients/${p.id}`}>
                    Open chart
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        )}
      </div>
    </div>
  );
}
