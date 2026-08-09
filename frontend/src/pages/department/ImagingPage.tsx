import { FormEvent, useEffect, useState } from "react";
import { format, parseISO } from "date-fns";
import { EmptyState } from "@/components/EmptyState";
import { api, apiUpload, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { StatGrid, useDepartmentHome } from "./FrontClinicalPages";

type Study = {
  id: string;
  patient_id: string;
  study_type: string;
  tooth?: string | null;
  storage_key?: string | null;
  notes?: string | null;
  captured_at: string;
  has_content?: boolean;
  content_type?: string | null;
  byte_size?: number | null;
  is_encrypted?: boolean;
  original_filename?: string | null;
};

type Patient = { id: string; first_name: string; last_name: string; patient_code: string };

export function ImagingPage() {
  const { home } = useDepartmentHome();
  const accessToken = useAuth((s) => s.accessToken);
  const [studies, setStudies] = useState<Study[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [preview, setPreview] = useState<{ id: string; url: string } | null>(null);
  const [form, setForm] = useState({
    patient_id: "",
    study_type: "PA",
    tooth: "",
    notes: "",
    file: null as File | null,
  });
  const [error, setError] = useState("");

  async function load() {
    const [s, p] = await Promise.all([
      api<Study[]>("/api/v1/imaging/studies"),
      api<{ items: Patient[] }>("/api/v1/patients?limit=50"),
    ]);
    setStudies(s);
    setPatients(p.items);
    if (!form.patient_id && p.items[0]) setForm((f) => ({ ...f, patient_id: p.items[0].id }));
  }

  useEffect(() => {
    load().catch((e) => setError(e.message));
    return () => {
      if (preview?.url) URL.revokeObjectURL(preview.url);
    };
  }, []);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setError("");
    try {
      const study = await api<Study>("/api/v1/imaging/studies", {
        method: "POST",
        body: JSON.stringify({
          patient_id: form.patient_id,
          study_type: form.study_type,
          tooth: form.tooth || null,
          notes: form.notes || null,
        }),
      });
      if (form.file) {
        const fd = new FormData();
        fd.append("file", form.file);
        await apiUpload(`/api/v1/imaging/studies/${study.id}/upload`, fd);
      }
      setForm((f) => ({ ...f, notes: "", tooth: "", file: null }));
      await load();
    } catch (err: any) {
      setError(err instanceof ApiError ? err.message : err.message);
    }
  }

  async function viewStudy(study: Study) {
    if (!study.has_content) {
      setError("No encrypted file uploaded for this study");
      return;
    }
    const apiBase = import.meta.env.VITE_API_BASE ?? "";
    const res = await fetch(`${apiBase}/api/v1/imaging/studies/${study.id}/content`, {
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
    });
    if (!res.ok) {
      setError("Unable to load image content");
      return;
    }
    const blob = await res.blob();
    if (preview?.url) URL.revokeObjectURL(preview.url);
    setPreview({ id: study.id, url: URL.createObjectURL(blob) });
  }

  return (
    <div className="animate-rise space-y-6">
      <div>
        <h2 className="font-display text-3xl font-bold text-brand-900">Imaging suite</h2>
        <p className="text-sm text-muted">
          Study registry · encrypted-at-rest local storage · tooth/visit link
        </p>
      </div>
      {home && <StatGrid home={home} />}
      {error && <p className="text-sm text-red-600">{error}</p>}
      <form className="glass-panel grid gap-3 rounded-3xl p-5 md:grid-cols-2" onSubmit={onCreate}>
        <label className="text-sm">
          Patient
          <select
            className="input mt-1"
            value={form.patient_id}
            onChange={(e) => setForm({ ...form, patient_id: e.target.value })}
            required
          >
            {patients.map((p) => (
              <option key={p.id} value={p.id}>
                {p.patient_code} · {p.first_name} {p.last_name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          Study type
          <select
            className="input mt-1"
            value={form.study_type}
            onChange={(e) => setForm({ ...form, study_type: e.target.value })}
          >
            {["PA", "BW", "OPG", "CBCT", "photo"].map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          Tooth
          <input className="input mt-1" value={form.tooth} onChange={(e) => setForm({ ...form, tooth: e.target.value })} />
        </label>
        <label className="text-sm">
          Notes
          <input className="input mt-1" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </label>
        <label className="text-sm md:col-span-2">
          Image / DICOM file
          <input
            className="input mt-1"
            type="file"
            accept="image/*,.dcm,application/dicom"
            onChange={(e) => setForm({ ...form, file: e.target.files?.[0] || null })}
          />
        </label>
        <button className="btn-primary md:col-span-2" type="submit">
          Register study{form.file ? " + upload" : ""}
        </button>
      </form>

      {preview && (
        <section className="glass-panel rounded-3xl p-5">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-display text-lg font-bold">Viewer</h3>
            <button
              type="button"
              className="btn-ghost text-xs"
              onClick={() => {
                URL.revokeObjectURL(preview.url);
                setPreview(null);
              }}
            >
              Close
            </button>
          </div>
          <img src={preview.url} alt="Imaging study" className="max-h-[480px] w-full object-contain" />
        </section>
      )}

      <section className="glass-panel rounded-3xl p-5">
        <h3 className="font-display text-lg font-bold">Studies</h3>
        {studies.length === 0 ? (
          <EmptyState title="No imaging studies" />
        ) : (
          <ul className="mt-3 divide-y divide-brand-100">
            {studies.map((s) => (
              <li key={s.id} className="flex flex-wrap items-start justify-between gap-2 py-3 text-sm">
                <div>
                  <div className="font-semibold">
                    {s.study_type}
                    {s.tooth ? ` · tooth ${s.tooth}` : ""}
                    {s.is_encrypted ? " · encrypted" : ""}
                  </div>
                  <div className="font-mono text-xs text-muted">{s.storage_key}</div>
                  <div className="text-xs text-muted">
                    {format(parseISO(s.captured_at), "MMM d, yyyy HH:mm")}
                    {s.byte_size != null ? ` · ${(s.byte_size / 1024).toFixed(1)} KB` : ""}
                    {s.original_filename ? ` · ${s.original_filename}` : ""}
                  </div>
                </div>
                {s.has_content && (
                  <button type="button" className="btn-ghost text-xs" onClick={() => void viewStudy(s)}>
                    View
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
