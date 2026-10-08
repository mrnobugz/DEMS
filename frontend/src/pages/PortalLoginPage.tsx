import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { AppearanceMenu } from "@/components/AppearanceMenu";
import { DemstaLogo } from "@/components/DemstaLogo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ApiError } from "@/lib/api";

const API_BASE = import.meta.env.VITE_API_BASE ?? "";

const schema = z.object({
  clinic_code: z.string().trim().min(1, "Clinic code is required"),
  patient_code: z.string().trim().min(1, "Patient ID is required"),
  pin: z.string().trim().min(1, "Portal PIN is required"),
});

type PortalValues = z.infer<typeof schema>;

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
  const [error, setError] = useState("");
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<PortalValues>({
    resolver: zodResolver(schema),
    defaultValues: { clinic_code: "MAIN", patient_code: "P202600001", pin: "1234" },
  });

  async function onSubmit(values: PortalValues) {
    setError("");
    try {
      const res = await fetch(`${API_BASE}/api/v1/portal/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clinic_code: values.clinic_code,
          patient_code: values.patient_code,
          pin: values.pin,
        }),
      });
      const data: unknown = await res.json();
      if (!res.ok) {
        const body = data as { error?: { code?: string; message?: string } };
        throw new ApiError(res.status, body.error?.code ?? "HTTP_ERROR", body.error?.message ?? res.statusText);
      }
      localStorage.setItem("demsta-portal", JSON.stringify(data));
      navigate("/portal");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Portal login failed");
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4">
      <div className="absolute right-4 top-4">
        <AppearanceMenu />
      </div>
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        <div className="absolute -left-20 top-10 h-72 w-72 rounded-full bg-brand-300/30 blur-3xl" />
        <div className="absolute bottom-0 right-0 h-96 w-96 rounded-full bg-brand-500/20 blur-3xl" />
      </div>
      <div className="glass-panel animate-rise relative w-full max-w-md rounded-[28px] p-8">
        <DemstaLogo withWordmark size={56} className="mb-6" />
        <h1 className="font-display text-3xl font-bold text-brand-900">Patient portal</h1>
        <p className="mt-2 text-sm text-muted">View appointments, invoices (TSh), and treatment plans.</p>
        <form className="mt-8 space-y-4" onSubmit={handleSubmit(onSubmit)} noValidate>
          <Input label="Clinic code" error={errors.clinic_code?.message} {...register("clinic_code")} />
          <Input label="Patient ID" error={errors.patient_code?.message} {...register("patient_code")} />
          <Input label="Portal PIN" type="password" error={errors.pin?.message} {...register("pin")} />
          {error && (
            <div className="rounded-xl border border-[var(--err-bd)] bg-[var(--err-bg)] px-3 py-2 text-sm text-[var(--err-fg)]" role="alert" aria-live="assertive">
              {error}
            </div>
          )}
          <Button className="w-full" type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Signing in…" : "Sign in"}
          </Button>
          <p className="text-center text-sm">
            <Link className="font-semibold text-brand-700 hover:underline" to="/login">
              Staff sign in
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
