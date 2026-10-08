import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { AppearanceMenu } from "@/components/AppearanceMenu";
import { DemstaLogo } from "@/components/DemstaLogo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { MODULES_DASHBOARD_PATH } from "@/lib/nav";
import type { User } from "@/lib/types";

const schema = z.object({
  clinic_code: z.string().trim().min(1, "Clinic code is required"),
  email: z.string().trim().email("Enter a valid email"),
  password: z.string().min(1, "Password is required"),
});

type LoginValues = z.infer<typeof schema>;

export function LoginPage() {
  const navigate = useNavigate();
  const setSession = useAuth((s) => s.setSession);
  const [error, setError] = useState("");
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      clinic_code: "MAIN",
      email: "front@demsta.clinic",
      password: "Demsta!Front1",
    },
  });

  async function onSubmit(values: LoginValues) {
    setError("");
    try {
      const data = await api<{
        access_token: string;
        refresh_token: string;
        user: User;
      }>("/api/v1/auth/login", {
        method: "POST",
        body: JSON.stringify({
          email: values.email,
          password: values.password,
          clinic_code: values.clinic_code,
        }),
      });
      setSession(data.access_token, data.refresh_token, data.user);
      navigate(MODULES_DASHBOARD_PATH);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Login failed");
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
        <h1 className="font-display text-3xl font-bold text-brand-900">Welcome back</h1>
        <p className="mt-2 text-sm text-muted">
          Sign in to <span className="font-semibold text-brand-700">DEMSTA</span> — clinic
          operations, clinical charting, and intelligent assist.
        </p>

        <form className="mt-8 space-y-4" onSubmit={handleSubmit(onSubmit)} noValidate>
          <Input label="Clinic code" autoComplete="organization" error={errors.clinic_code?.message} {...register("clinic_code")} />
          <Input label="Email" type="email" autoComplete="username" error={errors.email?.message} {...register("email")} />
          <Input label="Password" type="password" autoComplete="current-password" error={errors.password?.message} {...register("password")} />
          {error && (
            <div className="rounded-xl border border-[var(--err-bd)] bg-[var(--err-bg)] px-3 py-2 text-sm text-[var(--err-fg)]" role="alert" aria-live="assertive">
              {error}
            </div>
          )}
          <Button className="w-full" type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Signing in…" : "Sign in"}
          </Button>
          <p className="text-center text-xs text-muted">
            System owner: clinic code <code className="font-mono">PLATFORM</code> · <code className="font-mono">owner@demsta.clinic</code>
          </p>
          <p className="text-center text-xs text-muted">
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
