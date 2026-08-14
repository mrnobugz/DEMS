import { FormEvent, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { format, parseISO } from "date-fns";
import { EmptyState } from "@/components/EmptyState";
import { DentalArchFilter } from "@/components/viz/DentalArchFilter";
import { CompareViewer, ImageViewer } from "@/components/viz/ImageViewer";
import { VolumeWorkspace } from "@/components/viz/VolumeWorkspace";
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

const MODALITIES = ["PA", "BW", "OPG", "CBCT", "photo"];

export function ImagingPage() {
  const { home } = useDepartmentHome();
  const accessToken = useAuth((s) => s.accessToken);
  const [params] = useSearchParams();
  const [studies, setStudies] = useState<Study[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [preview, setPreview] = useState<{ id: string; url: string; study: Study } | null>(null);
  const [compare, setCompare] = useState<{ id: string; url: string; label: string }[]>([]);
  const [mprOpen, setMprOpen] = useState(false);
  const [toothFilter, setToothFilter] = useState<string[]>(params.get("tooth") ? [params.get("tooth")!] : []);
  const [modality, setModality] = useState("");
  const [form, setForm] = useState({
    patient_id: params.get("patient") || "",
    study_type: "PA",
    tooth: params.get("tooth") || "",
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

  const scoped = useMemo(() => {
    const pid = form.patient_id;
    return studies.filter((s) => !pid || s.patient_id === pid);
  }, [studies, form.patient_id]);

  const availableTeeth = useMemo(
    () => new Set(scoped.map((s) => s.tooth).filter((t): t is string => Boolean(t))),
    [scoped],
  );

  const visible = useMemo(() => {
    return scoped.filter((s) => {
      if (modality && s.study_type !== modality) return false;
      if (toothFilter.length && (!s.tooth || !toothFilter.includes(s.tooth))) return false;
      return true;
    });
  }, [scoped, modality, toothFilter]);

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

  async function fetchStudyUrl(study: Study): Promise<string | null> {
    if (!study.has_content) {
      setError("No encrypted file uploaded for this study");
      return null;
    }
    const apiBase = import.meta.env.VITE_API_BASE ?? "";
    const res = await fetch(`${apiBase}/api/v1/imaging/studies/${study.id}/content`, {
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
    });
    if (!res.ok) {
      setError("Unable to load image content");
      return null;
    }
    return URL.createObjectURL(await res.blob());
  }

  async function viewStudy(study: Study) {
    const url = await fetchStudyUrl(study);
    if (!url) return;
    if (preview?.url) URL.revokeObjectURL(preview.url);
    setPreview({ id: study.id, url, study });
    setMprOpen(study.study_type === "CBCT");
  }

  async function addToCompare(study: Study) {
    if (compare.some((c) => c.id === study.id)) return;
    const url = await fetchStudyUrl(study);
    if (!url) return;
    const label = `${study.study_type}${study.tooth ? ` · ${study.tooth}` : ""} · ${format(
      parseISO(study.captured_at),
      "MMM d, yyyy",
    )}`;
    setCompare((prev) => {
      const next = [...prev, { id: study.id, url, label }];
      while (next.length > 2) {
        const dropped = next.shift();
        if (dropped) URL.revokeObjectURL(dropped.url);
      }
      return next;
    });
  }

  function clearCompare() {
    compare.forEach((c) => URL.revokeObjectURL(c.url));
    setCompare([]);
  }

  return (
    <div className="animate-rise space-y-6">
      <div>
        <h2 className="font-display text-3xl font-bold text-brand-900">Imaging suite</h2>
        <p className="text-sm text-muted">
          Gallery · dental arch filter · darkroom · measurements · 3D/MPR mapping
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
            {MODALITIES.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          Tooth
          <input
            className="input mt-1"
            value={form.tooth}
            onChange={(e) => setForm({ ...form, tooth: e.target.value })}
            placeholder="FDI or pick on the arch filter"
          />
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

      <section className="glass-panel space-y-3 rounded-3xl p-5">
        <h3 className="font-display text-lg font-bold">Patient history</h3>
        <DentalArchFilter
          available={availableTeeth}
          selected={toothFilter}
          onChange={(teeth) => {
            setToothFilter(teeth);
            if (teeth[0]) setForm((f) => ({ ...f, tooth: teeth[teeth.length - 1] }));
          }}
        />
        <div className="flex flex-wrap gap-1">
          <button
            type="button"
            className={`rounded-full px-3 py-1 text-xs font-semibold ${!modality ? "bg-brand-500 text-white" : "border border-brand-100 bg-white text-muted"}`}
            onClick={() => setModality("")}
          >
            All modalities
          </button>
          {MODALITIES.map((m) => (
            <button
              key={m}
              type="button"
              className={`rounded-full px-3 py-1 text-xs font-semibold ${
                modality === m ? "bg-brand-500 text-white" : "border border-brand-100 bg-white text-muted"
              }`}
              onClick={() => setModality(m)}
            >
              {m}
            </button>
          ))}
        </div>
        {visible.length === 0 ? (
          <EmptyState title="No studies match this filter" />
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {visible.map((s) => (
              <li key={s.id} className="rounded-2xl border border-brand-100 bg-white/70 p-3 text-sm">
                <div className="font-semibold">
                  {s.study_type}
                  {s.tooth ? ` · tooth ${s.tooth}` : ""}
                  {s.is_encrypted ? " · encrypted" : ""}
                </div>
                <div className="text-xs text-muted">
                  {format(parseISO(s.captured_at), "MMM d, yyyy HH:mm")}
                  {s.byte_size != null ? ` · ${(s.byte_size / 1024).toFixed(1)} KB` : ""}
                </div>
                {s.original_filename && (
                  <div className="truncate text-[10px] text-muted">{s.original_filename}</div>
                )}
                <div className="mt-2 flex flex-wrap gap-1">
                  {s.has_content && (
                    <button type="button" className="btn-ghost text-xs" onClick={() => void viewStudy(s)}>
                      View
                    </button>
                  )}
                  {s.has_content && (
                    <button
                      type="button"
                      className={`btn-ghost text-xs ${compare.some((c) => c.id === s.id) ? "bg-brand-100" : ""}`}
                      onClick={() => void addToCompare(s)}
                    >
                      Compare
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn-ghost text-xs"
                    onClick={() => {
                      setPreview((p) => (p ? { ...p, study: s } : p));
                      setMprOpen(true);
                    }}
                  >
                    3D / MPR
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {preview && (
        <section className="glass-panel rounded-3xl p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="font-display text-lg font-bold">Review workspace</h3>
              <p className="text-xs text-muted">
                Length / angle / arrows / tooth tags · invert · darkroom · {preview.study.study_type}
                {preview.study.tooth ? ` · ${preview.study.tooth}` : ""}
              </p>
            </div>
            <div className="flex gap-1">
              <button type="button" className="btn-ghost text-xs" onClick={() => setMprOpen((v) => !v)}>
                {mprOpen ? "Hide MPR" : "Open MPR"}
              </button>
              <button
                type="button"
                className="btn-ghost text-xs"
                onClick={() => {
                  URL.revokeObjectURL(preview.url);
                  setPreview(null);
                  setMprOpen(false);
                }}
              >
                Close
              </button>
            </div>
          </div>
          <ImageViewer src={preview.url} alt="Imaging study" toothHint={preview.study.tooth} />
        </section>
      )}

      {mprOpen && (
        <section className="glass-panel rounded-3xl p-5">
          <VolumeWorkspace
            scoutUrl={preview?.url}
            implants={visible.filter((s) => s.notes?.toLowerCase().includes("implant")).map((s) => s.tooth || "").filter(Boolean)}
            selected={form.tooth || preview?.study.tooth || null}
            onSelect={(fdi) => setForm((f) => ({ ...f, tooth: fdi }))}
          />
        </section>
      )}

      {compare.length > 0 && (
        <section className="glass-panel rounded-3xl p-5">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h3 className="font-display text-lg font-bold">Before / after compare</h3>
              <p className="text-xs text-muted">
                {compare.length === 1
                  ? "Pick a second study with “Compare” to view side by side"
                  : "Independent zoom, window, and drawing tools per side"}
              </p>
            </div>
            <button type="button" className="btn-ghost text-xs" onClick={clearCompare}>
              Clear
            </button>
          </div>
          {compare.length === 2 ? (
            <CompareViewer
              left={compare[0].url}
              right={compare[1].url}
              leftLabel={compare[0].label}
              rightLabel={compare[1].label}
            />
          ) : (
            <p className="text-sm text-muted">1 of 2 selected — {compare[0].label}</p>
          )}
        </section>
      )}
    </div>
  );
}
