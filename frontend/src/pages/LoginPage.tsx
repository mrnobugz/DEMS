import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { DemstaLogo } from "@/components/DemstaLogo";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { roleHomePath } from "@/lib/nav";
import type { User } from "@/lib/types";

export function LoginPage() {
  const navigate = useNavigate();
  const setSession = useAuth((s) => s.setSession);
  const [email, setEmail] = useState("front@demsta.clinic");
  const [password, setPassword] = useState("Demsta!Front1");
  const [clinicCode, setClinicCode] = useState("MAIN");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const data = await api<{
        access_token: string;
        refresh_token: string;
        user: User;
      }>("/api/v1/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password, clinic_code: clinicCode }),
      });
      setSession(data.access_token, data.refresh_token, data.user);
      navigate(roleHomePath(data.user.role));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Login failed");
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
        <h1 className="font-display text-3xl font-bold text-brand-900">Welcome back</h1>
        <p className="mt-2 text-sm text-muted">
          Sign in to <span className="font-semibold text-brand-700">DEMSTA</span> — clinic
          operations, clinical charting, and intelligent assist.
        </p>

        <form className="mt-8 space-y-4" onSubmit={onSubmit} noValidate>
          <div>
            <label className="label" htmlFor="clinic-code">
              Clinic code
            </label>
            <input
              id="clinic-code"
              className="input"
              name="clinic_code"
              autoComplete="organization"
              value={clinicCode}
              onChange={(e) => setClinicCode(e.target.value)}
            />
          </div>
          <div>
            <label className="label" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              className="input"
              type="email"
              name="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="label" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              className="input"
              type="password"
              name="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          {error && (
            <div
              className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
              role="alert"
              aria-live="assertive"
            >
              {error}
            </div>
          )}
          <button className="btn-primary w-full" disabled={loading} type="submit">
            {loading ? "Signing in…" : "Sign in"}
          </button>
          <p className="text-center text-[11px] text-muted">
            System owner: clinic code <code className="font-mono">PLATFORM</code> ·{" "}
            <code className="font-mono">owner@demsta.clinic</code>
          </p>
          <p className="text-center text-[11px] text-muted">
            Patient portal:{" "}
            <a className="text-brand-700 hover:underline" href="/portal/login">
              /portal/login
            </a>{" "}
            · P202600001 / PIN 1234
          </p>
        </form>
      </div>
    </div>
  );
}
