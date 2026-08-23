import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Search, UserPlus, Users } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { api } from "@/lib/api";
import type { Page, Patient } from "@/lib/types";

function destPath(dept?: string | null) {
  if (!dept) return null;
  const allowed = ["restorative", "maxillofacial", "orthodontic", "paediatric"];
  return allowed.includes(dept) ? `/clinical/${dept}` : null;
}

export function PatientsPage() {
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [patients, setPatients] = useState<Patient[]>([]);
  const [total, setTotal] = useState(0);

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

  return (
    <div className="space-y-5 animate-rise">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl font-bold text-brand-900">Patients</h2>
          <p className="text-sm text-muted">
            {total} records · File opening and fees at reception. The dentist takes the history after
            consultation fees.
          </p>
        </div>
        <button
          className="btn-primary inline-flex items-center gap-2"
          onClick={() => navigate("/front-desk/register?step=0")}
        >
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

      <div className="glass-panel overflow-hidden rounded-3xl">
        {patients.length === 0 ? (
          <div className="p-4">
            <EmptyState
              title="No patients yet"
              hint="Register the first patient, collect fees, then send them to a clinical department."
              icon={Users}
              action={
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => navigate("/front-desk/register?step=0")}
                >
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
              <th className="px-4 py-3">Visit reason</th>
              <th className="px-4 py-3">Registration</th>
              <th className="px-4 py-3">Phone</th>
              <th className="px-4 py-3">Risk</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {patients.map((p) => {
              const clinical = destPath(p.destination_department);
              const finalized = p.registration_status === "finalized";
              return (
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
                <td className="px-4 py-3">
                  <span
                    className={`status-pill ${
                      finalized ? "status-pill--success" : "status-pill--warning"
                    }`}
                  >
                    {finalized ? "Finalized" : p.registration_status || "Draft"}
                  </span>
                  <div className="mt-1 text-[10px] text-muted">
                    Outstanding: {p.has_outstanding ? "Yes" : "No"}
                    {p.destination_department ? ` · ${p.destination_department}` : ""}
                  </div>
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
                  {finalized && clinical && (
                    <Link
                      className="mr-3 font-semibold text-brand-600"
                      to={`${clinical}?patient=${p.id}`}
                    >
                      Open in {p.destination_department}
                    </Link>
                  )}
                  <Link
                    className="mr-3 font-semibold text-brand-600"
                    to={`/front-desk/register?step=0&patient=${p.id}`}
                  >
                    New visit
                  </Link>
                  <Link className="font-semibold text-brand-600" to={`/patients/${p.id}`}>
                    Open chart
                  </Link>
                </td>
              </tr>
              );
            })}
          </tbody>
        </table>
        )}
      </div>
    </div>
  );
}
