import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { LegacyColumnDef } from "@tanstack/react-table/legacy";
import { Search, UserPlus, Users } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { DataTable } from "@/components/ui/data-table";
import { PageHeader } from "@/components/ui/tabs";
import { PageSkeleton } from "@/components/ui/accordion";
import { useAnnounce } from "@/components/ui/sonner";
import { api, ApiError } from "@/lib/api";
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useAnnounce(error);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      setLoading(true);
      setError("");
      void api<Page<Patient>>(`/api/v1/patients?limit=50&q=${encodeURIComponent(q)}`)
        .then((data) => {
          setPatients(data.items);
          setTotal(data.total);
        })
        .catch((err) => {
          setPatients([]);
          setTotal(0);
          setError(err instanceof ApiError ? err.message : "Could not load patients");
        })
        .finally(() => setLoading(false));
    }, 300);
    return () => window.clearTimeout(handle);
  }, [q]);

  const columns = useMemo<LegacyColumnDef<Patient, unknown>[]>(
    () => [
      {
        accessorKey: "patient_code",
        header: "ID",
        cell: ({ row }) => (
          <div className="font-mono text-xs text-brand-700">
            <div>{row.original.patient_code}</div>
            {row.original.hospital_reg_number && (
              <div className="text-[10px] text-muted">{row.original.hospital_reg_number}</div>
            )}
          </div>
        ),
      },
      {
        id: "name",
        header: "Name",
        accessorFn: (patient) => `${patient.first_name} ${patient.last_name}`,
        cell: ({ row }) => (
          <span className="font-semibold">
            {row.original.first_name} {row.original.last_name}
          </span>
        ),
      },
      {
        accessorKey: "chief_complaint",
        header: "Visit reason",
        cell: ({ row }) => <span className="block max-w-[14rem] truncate text-muted">{row.original.chief_complaint || "—"}</span>,
      },
      {
        accessorKey: "registration_status",
        header: "Registration",
        cell: ({ row }) => {
          const finalized = row.original.registration_status === "finalized";
          return (
            <div>
              <span className={`status-pill ${finalized ? "status-pill--success" : "status-pill--warning"}`}>
                {finalized ? "Finalized" : row.original.registration_status || "Draft"}
              </span>
              <div className="mt-1 text-[10px] text-muted">
                Outstanding: {row.original.has_outstanding ? "Yes" : "No"}
                {row.original.destination_department ? ` · ${row.original.destination_department}` : ""}
              </div>
            </div>
          );
        },
      },
      {
        accessorKey: "phone",
        header: "Phone",
        cell: ({ row }) => <span className="text-muted">{row.original.phone || "—"}</span>,
      },
      {
        accessorKey: "caries_risk_score",
        header: "Risk",
        cell: ({ row }) => {
          const score = row.original.caries_risk_score;
          if (score == null) return "—";
          const tone = score >= 0.6 ? "status-pill--danger" : score >= 0.35 ? "status-pill--warning" : "status-pill--success";
          return <span className={`status-pill ${tone}`}>{(score * 100).toFixed(0)}%</span>;
        },
      },
      {
        id: "actions",
        header: "",
        enableSorting: false,
        cell: ({ row }) => {
          const patient = row.original;
          const clinical = destPath(patient.destination_department);
          const finalized = patient.registration_status === "finalized";
          return (
            <div className="flex flex-wrap justify-end gap-3 text-right">
              {finalized && clinical && (
                <Link className="font-semibold text-brand-600" to={`${clinical}?patient=${patient.id}`}>
                  Open in {patient.destination_department}
                </Link>
              )}
              <Link className="font-semibold text-brand-600" to={`/front-desk/register?step=0&patient=${patient.id}`}>
                New visit
              </Link>
              <Link className="font-semibold text-brand-600" to={`/patients/${patient.id}`}>
                Open chart
              </Link>
            </div>
          );
        },
      },
    ],
    [],
  );

  return (
    <div className="space-y-5 animate-rise">
      <PageHeader
        title="Patients"
        description="File opening and fees at reception. The dentist takes the history after consultation fees."
        actions={
          <button type="button" className="btn-primary inline-flex items-center gap-2" onClick={() => navigate("/front-desk/register?step=0")}>
            <UserPlus size={16} aria-hidden /> New patient
          </button>
        }
      />
      <p className="text-sm text-muted" aria-live="polite">
        {total} records
      </p>

      <label className="block text-sm">
        <span className="label">Search patients</span>
        <span className="search-field">
          <Search className="search-field__icon" size={18} aria-hidden />
          <input
            className="input"
            type="search"
            placeholder="Name, phone, ID, hospital reg, city"
            value={q}
            onChange={(event) => setQ(event.target.value)}
            autoComplete="off"
          />
        </span>
      </label>

      {error && (
        <p className="text-sm text-danger" role="alert" aria-live="assertive">
          {error}
        </p>
      )}

      <div className="glass-panel overflow-hidden rounded-3xl">
        {loading && patients.length === 0 ? (
          <div className="p-4">
            <PageSkeleton rows={6} />
          </div>
        ) : (
          <DataTable
            data={patients}
            columns={columns}
            getRowId={(patient) => patient.id}
            caption="Patient register"
            empty={
              <div className="p-4">
                <EmptyState
                  title={q.trim() ? "No matching patients" : "No patients yet"}
                  hint={
                    q.trim()
                      ? "Try another name, phone, file number, or ID."
                      : "Register the first patient, collect fees, then send them to a clinical department."
                  }
                  icon={Users}
                  action={
                    <button type="button" className="btn-primary" onClick={() => navigate("/front-desk/register?step=0")}>
                      New patient
                    </button>
                  }
                />
              </div>
            }
          />
        )}
      </div>
    </div>
  );
}
