import { FormEvent, useMemo, useState } from "react";
import { api, ApiError } from "@/lib/api";
import type { PerioExam } from "@/lib/types";

const SITES = [
  { code: "mb", label: "MB" },
  { code: "b", label: "B" },
  { code: "db", label: "DB" },
  { code: "ml", label: "ML" },
  { code: "l", label: "L" },
  { code: "dl", label: "DL" },
] as const;

type SiteDraft = {
  site_code: string;
  pocket_depth_mm: string;
  bleeding_on_probing: boolean;
  recession_mm: string;
  plaque_index: string;
  gingival_index: string;
};

function emptySites(): SiteDraft[] {
  return SITES.map((s) => ({
    site_code: s.code,
    pocket_depth_mm: "3",
    bleeding_on_probing: false,
    recession_mm: "0",
    plaque_index: "0",
    gingival_index: "0",
  }));
}

type Props = {
  patientId: string;
  selectedTooth: string | null;
  exams: PerioExam[];
  onSaved: () => Promise<void>;
  onMessage: (msg: string) => void;
};

export function PerioChart({ patientId, selectedTooth, exams, onSaved, onMessage }: Props) {
  const tooth = selectedTooth || "16";
  const [sites, setSites] = useState<SiteDraft[]>(emptySites);
  const [mobility, setMobility] = useState("0");
  const [furcation, setFurcation] = useState("0");
  const [notes, setNotes] = useState("");
  const [draftTeeth, setDraftTeeth] = useState<
    Array<{
      tooth_number: string;
      mobility_grade: number;
      furcation_grade: number;
      sites: SiteDraft[];
    }>
  >([]);
  const [busy, setBusy] = useState(false);

  const latest = exams[0] ?? null;

  const trendForTooth = useMemo(() => {
    if (!selectedTooth) return [];
    return exams
      .map((exam) => {
        const toothSites = exam.sites.filter((s) => s.tooth_number === selectedTooth);
        if (!toothSites.length) return null;
        const depths = toothSites
          .map((s) => s.pocket_depth_mm)
          .filter((d): d is number => d != null);
        const mean = depths.length ? depths.reduce((a, b) => a + b, 0) / depths.length : null;
        const bop = toothSites.filter((s) => s.bleeding_on_probing).length;
        return {
          exam_date: exam.exam_date,
          mean_pd: mean != null ? Number(mean.toFixed(1)) : null,
          bop_sites: bop,
          risk_band: exam.risk_band,
        };
      })
      .filter(Boolean) as Array<{
      exam_date: string;
      mean_pd: number | null;
      bop_sites: number;
      risk_band: string;
    }>;
  }, [exams, selectedTooth]);

  function queueTooth() {
    setDraftTeeth((current) => {
      const next = current.filter((t) => t.tooth_number !== tooth);
      next.push({
        tooth_number: tooth,
        mobility_grade: Number(mobility) || 0,
        furcation_grade: Number(furcation) || 0,
        sites: sites.map((s) => ({ ...s })),
      });
      return next;
    });
    onMessage(`Queued perio readings for tooth ${tooth}`);
  }

  async function saveExam(e: FormEvent) {
    e.preventDefault();
    const queued =
      draftTeeth.length > 0
        ? draftTeeth
        : [
            {
              tooth_number: tooth,
              mobility_grade: Number(mobility) || 0,
              furcation_grade: Number(furcation) || 0,
              sites,
            },
          ];

    const payloadSites = queued.flatMap((t) =>
      t.sites.map((s, idx) => ({
        tooth_number: t.tooth_number,
        site_code: s.site_code,
        pocket_depth_mm: s.pocket_depth_mm === "" ? null : Number(s.pocket_depth_mm),
        bleeding_on_probing: s.bleeding_on_probing,
        recession_mm: s.recession_mm === "" ? null : Number(s.recession_mm),
        plaque_index: s.plaque_index === "" ? null : Number(s.plaque_index),
        gingival_index: s.gingival_index === "" ? null : Number(s.gingival_index),
        mobility_grade: idx === 0 ? t.mobility_grade : null,
        furcation_grade: idx === 0 ? t.furcation_grade : null,
      })),
    );

    setBusy(true);
    try {
      await api(`/api/v1/clinical/patients/${patientId}/perio`, {
        method: "POST",
        body: JSON.stringify({ notes: notes || null, sites: payloadSites }),
      });
      setDraftTeeth([]);
      setNotes("");
      setSites(emptySites());
      setMobility("0");
      setFurcation("0");
      await onSaved();
      onMessage("Periodontal exam saved");
    } catch (err) {
      onMessage(err instanceof ApiError ? err.message : "Perio exam save failed");
    } finally {
      setBusy(false);
    }
  }

  async function convertExam(exam: PerioExam) {
    setBusy(true);
    try {
      await api(`/api/v1/clinical/patients/${patientId}/perio/${exam.id}/to-treatment-plan`, {
        method: "POST",
      });
      await onSaved();
      onMessage(`Created treatment plan from perio exam ${exam.exam_date}`);
    } catch (err) {
      onMessage(err instanceof ApiError ? err.message : "Could not convert perio exam");
    } finally {
      setBusy(false);
    }
  }

  function riskClass(band: string) {
    if (band === "high") return "bg-rose-50 text-rose-700";
    if (band === "moderate") return "bg-amber-50 text-amber-800";
    return "bg-emerald-50 text-emerald-700";
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[1.25fr_0.75fr]">
      <form className="glass-panel space-y-4 rounded-3xl p-5" onSubmit={saveExam}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="font-display text-lg font-bold">Periodontal charting</h3>
            <p className="text-sm text-muted">
              6-site probing for tooth <strong>{tooth}</strong>
              {selectedTooth ? "" : " (select on odontogram, or editing 16)"}
            </p>
          </div>
          {latest && (
            <div className={`rounded-2xl px-3 py-2 text-sm font-semibold ${riskClass(latest.risk_band)}`}>
              Latest: {latest.risk_band} · recall {latest.suggested_recall_months} mo
            </div>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-muted">
                <th className="pb-2 pr-2">Site</th>
                <th className="pb-2 pr-2">PD mm</th>
                <th className="pb-2 pr-2">BOP</th>
                <th className="pb-2 pr-2">Rec mm</th>
                <th className="pb-2 pr-2">Plaque</th>
                <th className="pb-2">GI</th>
              </tr>
            </thead>
            <tbody>
              {sites.map((site, index) => (
                <tr key={site.site_code} className="border-t border-brand-100">
                  <td className="py-2 pr-2 font-semibold">{SITES[index].label}</td>
                  <td className="py-2 pr-2">
                    <input
                      type="number"
                      min={0}
                      max={15}
                      className="input w-16"
                      value={site.pocket_depth_mm}
                      onChange={(e) =>
                        setSites((current) =>
                          current.map((row, i) =>
                            i === index ? { ...row, pocket_depth_mm: e.target.value } : row,
                          ),
                        )
                      }
                    />
                  </td>
                  <td className="py-2 pr-2">
                    <input
                      type="checkbox"
                      checked={site.bleeding_on_probing}
                      onChange={(e) =>
                        setSites((current) =>
                          current.map((row, i) =>
                            i === index ? { ...row, bleeding_on_probing: e.target.checked } : row,
                          ),
                        )
                      }
                    />
                  </td>
                  <td className="py-2 pr-2">
                    <input
                      type="number"
                      min={0}
                      max={15}
                      className="input w-16"
                      value={site.recession_mm}
                      onChange={(e) =>
                        setSites((current) =>
                          current.map((row, i) =>
                            i === index ? { ...row, recession_mm: e.target.value } : row,
                          ),
                        )
                      }
                    />
                  </td>
                  <td className="py-2 pr-2">
                    <input
                      type="number"
                      min={0}
                      max={3}
                      step={0.5}
                      className="input w-16"
                      value={site.plaque_index}
                      onChange={(e) =>
                        setSites((current) =>
                          current.map((row, i) =>
                            i === index ? { ...row, plaque_index: e.target.value } : row,
                          ),
                        )
                      }
                    />
                  </td>
                  <td className="py-2">
                    <input
                      type="number"
                      min={0}
                      max={3}
                      step={0.5}
                      className="input w-16"
                      value={site.gingival_index}
                      onChange={(e) =>
                        setSites((current) =>
                          current.map((row, i) =>
                            i === index ? { ...row, gingival_index: e.target.value } : row,
                          ),
                        )
                      }
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label className="label">Mobility (0–3)</label>
            <input
              type="number"
              min={0}
              max={3}
              className="input"
              value={mobility}
              onChange={(e) => setMobility(e.target.value)}
            />
          </div>
          <div>
            <label className="label">Furcation (0–3)</label>
            <input
              type="number"
              min={0}
              max={3}
              className="input"
              value={furcation}
              onChange={(e) => setFurcation(e.target.value)}
            />
          </div>
          <div>
            <label className="label">Exam notes</label>
            <input
              className="input"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Hygiene visit findings"
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-ghost" onClick={queueTooth} disabled={busy}>
            Queue tooth {tooth}
          </button>
          <button className="btn-primary" disabled={busy}>
            Save perio exam{draftTeeth.length ? ` (${draftTeeth.length} teeth)` : ""}
          </button>
        </div>

        {draftTeeth.length > 0 && (
          <p className="text-sm text-muted">
            Queued: {draftTeeth.map((t) => t.tooth_number).join(", ")}
          </p>
        )}
      </form>

      <div className="space-y-4">
        <div className="glass-panel rounded-3xl p-5">
          <h3 className="font-display text-lg font-bold">Exam history</h3>
          <div className="mt-3 space-y-3">
            {exams.length === 0 && (
              <p className="text-sm text-muted">No periodontal exams yet.</p>
            )}
            {exams.map((exam) => (
              <div key={exam.id} className="rounded-2xl border border-brand-100 bg-white/70 p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-semibold text-ink">{exam.exam_date}</p>
                    <p className="text-muted">
                      Mean PD {exam.mean_pocket_depth ?? "—"} · BOP {exam.bleeding_pct ?? "—"}% ·{" "}
                      {exam.sites.length} sites
                    </p>
                  </div>
                  <span className={`rounded-full px-2 py-1 text-xs font-semibold ${riskClass(exam.risk_band)}`}>
                    {exam.risk_band} · {exam.suggested_recall_months} mo
                  </span>
                </div>
                <button
                  type="button"
                  className="btn-ghost mt-2 text-xs"
                  disabled={busy}
                  onClick={() => void convertExam(exam)}
                >
                  Add elevated sites to treatment plan
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="glass-panel rounded-3xl p-5">
          <h3 className="font-display text-lg font-bold">
            Trend{selectedTooth ? ` · tooth ${selectedTooth}` : ""}
          </h3>
          {!selectedTooth && (
            <p className="mt-2 text-sm text-muted">Select a tooth on the odontogram to see trends.</p>
          )}
          {selectedTooth && trendForTooth.length === 0 && (
            <p className="mt-2 text-sm text-muted">No prior readings for this tooth.</p>
          )}
          <div className="mt-3 space-y-2">
            {trendForTooth.map((row) => (
              <div
                key={row.exam_date}
                className="flex items-center justify-between rounded-xl border border-brand-100 px-3 py-2 text-sm"
              >
                <span>{row.exam_date}</span>
                <span className="text-muted">
                  PD {row.mean_pd ?? "—"} · BOP {row.bop_sites}/6
                </span>
                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${riskClass(row.risk_band)}`}>
                  {row.risk_band}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
