import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { DemstaLogo } from "@/components/DemstaLogo";
import { ApiError } from "@/lib/api";

const API_BASE = import.meta.env.VITE_API_BASE ?? "";

type PortalSession = {
  access_token: string;
  patient: {
    id: string;
    patient_code: string;
    first_name: string;
    last_name: string;
    clinic_code: string;
    clinic_name: string;
    currency: string;
  };
};

export function getPortalSession(): PortalSession | null {
  try {
    const raw = localStorage.getItem("demsta-portal");
    return raw ? (JSON.parse(raw) as PortalSession) : null;
  } catch {
    return null;
  }
}

export function clearPortalSession() {
  localStorage.removeItem("demsta-portal");
}

export function PortalLoginPage() {
  const navigate = useNavigate();
  const [clinicCode, setClinicCode] = useState("MAIN");
  const [patientCode, setPatientCode] = useState("P202600001");
  const [pin, setPin] = useState("1234");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${API_BASE}/api/v1/portal/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clinic_code: clinicCode,
          patient_code: patientCode,
          pin,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new ApiError(
          res.status,
          data?.error?.code ?? "HTTP_ERROR",
          data?.error?.message ?? res.statusText,
        );
      }
      localStorage.setItem("demsta-portal", JSON.stringify(data));
      navigate("/portal");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Portal login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4">
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        <div className="absolute -left-20 top-10 h-72 w-72 rounded-full bg-brand-300/30 blur-3xl" />
        <div className="absolute bottom-0 right-0 h-96 w-96 rounded-full bg-brand-500/20 blur-3xl" />
      </div>
      <div className="glass-panel animate-rise relative w-full max-w-md rounded-[28px] p-8">
        <DemstaLogo withWordmark size={56} className="mb-6" />
        <h1 className="font-display text-3xl font-bold text-brand-900">Patient portal</h1>
        <p className="mt-2 text-sm text-muted">
          View appointments, invoices (TSh), and treatment plans.
        </p>
        <form className="mt-8 space-y-4" onSubmit={onSubmit}>
          <div>
            <label className="label" htmlFor="clinic">
              Clinic code
            </label>
            <input
              id="clinic"
              className="input"
              value={clinicCode}
              onChange={(e) => setClinicCode(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="label" htmlFor="patient">
              Patient ID
            </label>
            <input
              id="patient"
              className="input"
              value={patientCode}
              onChange={(e) => setPatientCode(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="label" htmlFor="pin">
              Portal PIN
            </label>
            <input
              id="pin"
              className="input"
              type="password"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              required
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button className="btn-primary w-full" disabled={loading} type="submit">
            {loading ? "Signing in…" : "Open portal"}
          </button>
        </form>
        <p className="mt-4 text-center text-xs text-muted">
          Staff? <Link className="text-brand-700 hover:underline" to="/login">Clinic login</Link>
        </p>
      </div>
    </div>
  );
}
