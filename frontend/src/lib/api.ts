import { useAuth } from "./auth";

const API_BASE = import.meta.env.VITE_API_BASE ?? "";

export class ApiError extends Error {
  code: string;
  details: unknown;
  status: number;

  constructor(status: number, code: string, message: string, details: unknown = []) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

async function refreshAccess(): Promise<string | null> {
  const { refreshToken, setSession, clear, user } = useAuth.getState();
  if (!refreshToken) return null;
  const res = await fetch(`${API_BASE}/api/v1/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
  if (!res.ok) {
    clear();
    return null;
  }
  const data = await res.json();
  setSession(data.access_token, data.refresh_token, data.user ?? user);
  return data.access_token as string;
}

export async function api<T>(
  path: string,
  options: RequestInit = {},
  retry = true,
): Promise<T> {
  const headers = new Headers(options.headers);
  if (!headers.has("Content-Type") && options.body) {
    headers.set("Content-Type", "application/json");
  }
  const token = useAuth.getState().accessToken;
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const { user, activeClinicId } = useAuth.getState();
  if (user?.role === "super_admin" && activeClinicId) {
    headers.set("X-Clinic-Id", activeClinicId);
  }

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });

  if (res.status === 401 && retry) {
    const next = await refreshAccess();
    if (next) return api<T>(path, options, false);
  }

  if (!res.ok) {
    let payload: any = null;
    try {
      payload = await res.json();
    } catch {
      /* ignore */
    }
    const err = payload?.error;
    throw new ApiError(
      res.status,
      err?.code ?? "HTTP_ERROR",
      err?.message ?? res.statusText,
      err?.details ?? [],
    );
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

/** Multipart upload — do not set Content-Type (browser sets boundary). */
export async function apiUpload<T>(path: string, formData: FormData, retry = true): Promise<T> {
  const headers = new Headers();
  const token = useAuth.getState().accessToken;
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const { user, activeClinicId } = useAuth.getState();
  if (user?.role === "super_admin" && activeClinicId) {
    headers.set("X-Clinic-Id", activeClinicId);
  }
  const res = await fetch(`${API_BASE}${path}`, { method: "POST", headers, body: formData });
  if (res.status === 401 && retry) {
    const next = await refreshAccess();
    if (next) return apiUpload<T>(path, formData, false);
  }
  if (!res.ok) {
    let payload: any = null;
    try {
      payload = await res.json();
    } catch {
      /* ignore */
    }
    const err = payload?.error;
    throw new ApiError(
      res.status,
      err?.code ?? "HTTP_ERROR",
      err?.message ?? res.statusText,
      err?.details ?? [],
    );
  }
  return res.json() as Promise<T>;
}

export function imagingContentUrl(studyId: string): string {
  const token = useAuth.getState().accessToken;
  const base = `${API_BASE}/api/v1/imaging/studies/${studyId}/content`;
  return token ? `${base}?access_token=${encodeURIComponent(token)}` : base;
}
