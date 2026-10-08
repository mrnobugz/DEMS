import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Pill, Plus, Trash2 } from "lucide-react";
import { ConfigField, ConfigStatus } from "@/components/config/ConfigUi";
import { EmptyState } from "@/components/EmptyState";
import { Modal } from "@/components/Modal";
import { api, ApiError } from "@/lib/api";
import { formatMoney } from "@/lib/i18n";
import { useUiPrefs } from "@/lib/uiPrefs";

type Template = {
  id: string;
  name: string;
  default_dose: string;
  default_quantity: string;
  instructions?: string | null;
  is_controlled: boolean;
  inventory_item_id?: string | null;
  sale_price?: number | null;
};

type Rx = {
  id: string;
  rx_number?: string | null;
  status: string;
  invoice_id?: string | null;
  items: { drug_name: string; dose: string; quantity: string; frequency?: string | null }[];
};

type DraftLine = {
  key: string;
  templateId: string;
  drugName: string;
  dose: string;
  frequency: string;
  timesPerDay: number;
  days: number;
  quantity: number;
  startDate: string;
  endDate: string;
  instructions: string;
  unitPrice: number;
  controlled: boolean;
};

const FREQUENCY_OPTIONS: { value: string; label: string; times: number }[] = [
  { value: "Once daily", label: "Once daily", times: 1 },
  { value: "Twice daily", label: "Twice daily", times: 2 },
  { value: "Three times daily", label: "Three times daily", times: 3 },
  { value: "Four times daily", label: "Four times daily", times: 4 },
  { value: "Every 8 hours", label: "Every 8 hours", times: 3 },
  { value: "Every 6 hours", label: "Every 6 hours", times: 4 },
  { value: "As needed", label: "As needed", times: 0 },
];

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function addDaysIso(start: string, days: number) {
  const d = new Date(`${start}T12:00:00`);
  if (Number.isNaN(d.getTime())) return start;
  d.setDate(d.getDate() + Math.max(days - 1, 0));
  return d.toISOString().slice(0, 10);
}

function unitsFromTemplate(tmpl: Template | undefined) {
  const raw = tmpl?.default_quantity || "1";
  const match = String(raw).match(/(\d+(?:\.\d+)?)/);
  return match ? Math.max(1, Math.round(Number(match[1]))) : 1;
}

function calcQty(unitsEach: number, timesPerDay: number, days: number) {
  if (timesPerDay <= 0) return Math.max(1, unitsEach);
  return Math.max(1, unitsEach * timesPerDay * Math.max(1, days));
}

function newKey() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function titleCase(status: string) {
  return status.replaceAll("_", " ");
}

function statusTone(status: string) {
  if (status === "dispensed" || status === "fulfilled") return "status-pill--success";
  if (status === "partial" || status === "active" || status === "pending" || status === "waiting") {
    return "status-pill--info";
  }
  if (status === "cancelled" || status === "rejected") return "status-pill--danger";
  return "status-pill--warning";
}

export function PatientMedicationList({ patientId }: { patientId: string }) {
  const [rows, setRows] = useState<Rx[] | null>(null);

  useEffect(() => {
    let alive = true;
    api<Rx[]>(`/api/v1/pharmacy/prescriptions?patient_id=${patientId}`)
      .then((data) => {
        if (alive) setRows(data);
      })
      .catch(() => {
        if (alive) setRows(null);
      });
    return () => {
      alive = false;
    };
  }, [patientId]);

  if (!rows) return null;
  return (
    <section className="glass-panel space-y-2">
      <div className="clin-head">
        <h3 className="font-display text-base font-bold text-brand-900">Medicines</h3>
        <Link className="btn-ghost text-sm" to="/pharmacy">
          Pharmacy queue
        </Link>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-muted">No prescriptions on this chart yet.</p>
      ) : (
        <ul className="rx-list">
          {rows.slice(0, 8).map((row) => (
            <li key={row.id} className="rx-list__row">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-brand-900">
                  <span className="font-mono text-xs text-brand-700">{row.rx_number || "RX"}</span>{" "}
                  {row.items.map((item) => `${item.drug_name} ${item.dose}`).join(", ")}
                </p>
              </div>
              <span className={`status-pill ${statusTone(row.status)}`}>{titleCase(row.status)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function ChairsidePharmacy({ patientId }: { patientId?: string }) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [rx, setRx] = useState<Rx[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");

  async function load() {
    setLoading(true);
    try {
      const [drugs, scripts] = await Promise.all([
        api<Template[]>("/api/v1/pharmacy/templates"),
        patientId
          ? api<Rx[]>(`/api/v1/pharmacy/prescriptions?patient_id=${patientId}`)
          : Promise.resolve([] as Rx[]),
      ]);
      setTemplates(drugs);
      setRx(scripts);
      setError("");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Pharmacy unavailable");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [patientId]);

  return (
    <section className="glass-panel chairside-rx space-y-3">
      <div className="clin-head">
        <div className="min-w-0">
          <h3 className="font-display text-base font-bold text-brand-900">Pharmacy</h3>
          <p className="text-sm text-muted">Sign a formulary script, preview the bill, then send it to pharmacy.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link className="btn-ghost" to="/pharmacy">
            Open pharmacy
          </Link>
          <button
            type="button"
            className="btn-primary"
            disabled={!patientId || templates.length === 0}
            onClick={() => {
              setMsg("");
              setError("");
              setOpen(true);
            }}
          >
            Prescribe
          </button>
        </div>
      </div>

      <ConfigStatus loading={loading} error={error} ok={msg} />

      {!patientId ? (
        <EmptyState
          title="Select a patient"
          hint="Choose someone from today’s queue or open their file before prescribing."
          icon={Pill}
        />
      ) : loading ? null : rx.length === 0 ? (
        <EmptyState
          title="No prescriptions yet"
          hint="Use Prescribe to add formulary drugs, preview billing, and send the script."
          icon={Pill}
          action={
            <button type="button" className="btn-primary" disabled={templates.length === 0} onClick={() => setOpen(true)}>
              Prescribe
            </button>
          }
        />
      ) : (
        <ul className="rx-list" aria-label="Prescriptions for this visit">
          {rx.map((row) => (
            <li key={row.id} className="rx-list__row">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-brand-900">
                  <span className="font-mono text-xs text-brand-700">{row.rx_number || "RX"}</span>{" "}
                  {row.items.map((item) => item.drug_name).join(", ")}
                </p>
                <p className="mt-0.5 text-xs text-muted">
                  {row.items
                    .map((item) =>
                      [item.frequency, item.dose, item.quantity ? `qty ${item.quantity}` : null]
                        .filter(Boolean)
                        .join(" · "),
                    )
                    .join("; ")}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {row.invoice_id ? (
                  <Link className="status-pill status-pill--success" to="/billing">
                    Billed
                  </Link>
                ) : (
                  <span className="status-pill status-pill--warning">Unbilled</span>
                )}
                <span className={`status-pill ${statusTone(row.status)}`}>{titleCase(row.status)}</span>
              </div>
            </li>
          ))}
        </ul>
      )}

      {open && patientId && (
        <PrescribeDialog
          patientId={patientId}
          templates={templates}
          onClose={() => setOpen(false)}
          onSaved={async (message) => {
            setOpen(false);
            setMsg(message);
            await load();
          }}
        />
      )}
    </section>
  );
}

function PrescribeDialog({
  patientId,
  templates,
  onClose,
  onSaved,
}: {
  patientId: string;
  templates: Template[];
  onClose: () => void;
  onSaved: (message: string) => Promise<void>;
}) {
  const currency = useUiPrefs((s) => s.currency);
  const locale = useUiPrefs((s) => s.locale);
  const money = (amount: number) => formatMoney(amount, currency, locale);

  const [templateId, setTemplateId] = useState(templates[0]?.id || "");
  const [frequency, setFrequency] = useState(FREQUENCY_OPTIONS[1]!.value);
  const [days, setDays] = useState(5);
  const [quantity, setQuantity] = useState(() => {
    const tmpl = templates[0];
    return calcQty(unitsFromTemplate(tmpl), 2, 5);
  });
  const [startDate, setStartDate] = useState(todayIso());
  const [endDate, setEndDate] = useState(() => addDaysIso(todayIso(), 5));
  const [instructions, setInstructions] = useState(templates[0]?.instructions || "");
  const [preview, setPreview] = useState<DraftLine[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [qtyTouched, setQtyTouched] = useState(false);

  const selected = templates.find((row) => row.id === templateId);
  const freqMeta = FREQUENCY_OPTIONS.find((row) => row.value === frequency) || FREQUENCY_OPTIONS[0]!;
  const unitPrice = Number(selected?.sale_price || 0);
  const lineEstimate = quantity * unitPrice;

  useEffect(() => {
    if (!selected) return;
    setInstructions(selected.instructions || "");
    if (!qtyTouched) {
      setQuantity(calcQty(unitsFromTemplate(selected), freqMeta.times, days));
    }
  }, [templateId]);

  useEffect(() => {
    setEndDate(addDaysIso(startDate, days));
    if (!qtyTouched && selected) {
      setQuantity(calcQty(unitsFromTemplate(selected), freqMeta.times, days));
    }
  }, [days, frequency, startDate]);

  const totals = useMemo(() => {
    const totalQty = preview.reduce((sum, line) => sum + line.quantity, 0);
    const billing = preview.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0);
    return { totalQty, billing };
  }, [preview]);

  function chooseTemplate(id: string) {
    setTemplateId(id);
    setQtyTouched(false);
    const tmpl = templates.find((row) => row.id === id);
    if (!tmpl) return;
    setInstructions(tmpl.instructions || "");
    setQuantity(calcQty(unitsFromTemplate(tmpl), freqMeta.times, days));
  }

  function onAdd() {
    setError("");
    if (!selected) {
      setError("Choose a formulary drug");
      return;
    }
    if (!frequency.trim()) {
      setError("Choose a frequency");
      return;
    }
    if (days < 1) {
      setError("Days must be at least 1");
      return;
    }
    if (quantity < 1) {
      setError("Total quantity must be at least 1");
      return;
    }
    if (!startDate || !endDate) {
      setError("Start and end dates are required");
      return;
    }
    if (endDate < startDate) {
      setError("End date cannot be before start date");
      return;
    }
    if (unitPrice <= 0) {
      setError(`${selected.name} has no sale price. Link it in Pharmacy formulary / Inventory first.`);
      return;
    }
    setPreview((current) => [
      ...current,
      {
        key: newKey(),
        templateId: selected.id,
        drugName: selected.name,
        dose: selected.default_dose || "1",
        frequency,
        timesPerDay: freqMeta.times,
        days,
        quantity,
        startDate,
        endDate,
        instructions: instructions.trim(),
        unitPrice,
        controlled: Boolean(selected.is_controlled),
      },
    ]);
    setQtyTouched(false);
  }

  function removeLine(key: string) {
    setPreview((current) => current.filter((line) => line.key !== key));
  }

  async function onSave(e: FormEvent) {
    e.preventDefault();
    if (preview.length === 0) {
      setError("Add at least one drug to the preview");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const warnings: string[] = [];
      for (const line of preview) {
        const warn = await api<{ warnings: string[] }>("/api/v1/pharmacy/warn", {
          method: "POST",
          body: JSON.stringify({ patient_id: patientId, drug_name: line.drugName }),
        });
        warnings.push(...(warn.warnings || []));
      }
      if (warnings.length) {
        const proceed = window.confirm(`${warnings.join("\n")}\n\nBill and send to pharmacy anyway?`);
        if (!proceed) {
          setBusy(false);
          return;
        }
      }
      const created = await api<Rx>("/api/v1/pharmacy/prescriptions", {
        method: "POST",
        body: JSON.stringify({
          patient_id: patientId,
          bill: true,
          items: preview.map((line) => ({
            drug_name: line.drugName,
            dose: line.dose,
            quantity: String(line.quantity),
            frequency: line.frequency,
            days: line.days,
            start_date: line.startDate,
            end_date: line.endDate,
            instructions: line.instructions || null,
            drug_template_id: line.templateId,
          })),
        }),
      });
      await onSaved(
        `${created.rx_number || "Prescription"} billed (${money(totals.billing)}) and sent to pharmacy.`,
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not bill and send prescription");
      setBusy(false);
    }
  }

  return (
    <Modal
      title="Prescribe"
      subtitle="Compose the course, add lines to the preview, then save to bill and send to pharmacy."
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn-ghost" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button
            type="submit"
            form="chairside-rx-form"
            className="btn-primary"
            disabled={busy || preview.length === 0}
          >
            {busy ? "Saving…" : "Save to pharmacy"}
          </button>
        </>
      }
    >
      <form id="chairside-rx-form" className="chairside-rx-dialog space-y-4" onSubmit={onSave}>
        <ConfigStatus error={error} />

        <section className="chairside-rx-dialog__compose" aria-labelledby="rx-compose-title">
          <h3 id="rx-compose-title" className="chairside-rx-dialog__title">
            1. Course details
          </h3>
          <div className="chairside-rx-dialog__grid">
            <ConfigField label="Formulary drug">
              <select className="input" value={templateId} onChange={(e) => chooseTemplate(e.target.value)} required>
                <option value="">Choose</option>
                {templates.map((tmpl) => (
                  <option key={tmpl.id} value={tmpl.id}>
                    {tmpl.name}
                    {tmpl.is_controlled ? " (controlled)" : ""}
                    {tmpl.sale_price != null && tmpl.sale_price > 0 ? ` · ${money(tmpl.sale_price)}` : " · no price"}
                  </option>
                ))}
              </select>
            </ConfigField>

            <ConfigField label="Frequency">
              <select
                className="input"
                value={frequency}
                onChange={(e) => {
                  setFrequency(e.target.value);
                  setQtyTouched(false);
                }}
                required
              >
                {FREQUENCY_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </ConfigField>

            <ConfigField label="Days" hint="End date follows the course length.">
              <input
                className="input"
                type="number"
                min={1}
                max={365}
                value={days}
                onChange={(e) => {
                  setDays(Math.max(1, Number(e.target.value) || 1));
                  setQtyTouched(false);
                }}
                required
              />
            </ConfigField>

            <ConfigField label="Total quantity" hint="Suggested from frequency × days; edit if needed.">
              <input
                className="input"
                type="number"
                min={1}
                value={quantity}
                onChange={(e) => {
                  setQtyTouched(true);
                  setQuantity(Math.max(1, Number(e.target.value) || 1));
                }}
                required
              />
            </ConfigField>

            <ConfigField label="Start date">
              <input
                className="input"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                required
              />
            </ConfigField>

            <ConfigField label="Ending date">
              <input className="input" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} required />
            </ConfigField>

            <div className="chairside-rx-dialog__span">
              <ConfigField label="Instructions">
                <input
                  className="input"
                  value={instructions}
                  onChange={(e) => setInstructions(e.target.value)}
                  placeholder="e.g. After meals, finish the course"
                />
              </ConfigField>
            </div>
          </div>

          <div className="chairside-rx-dialog__addbar">
            <div className="min-w-0 text-sm">
              <p className="font-semibold text-brand-900">
                Line estimate · {quantity} units · {money(lineEstimate)}
              </p>
              <p className="text-xs text-muted">
                {selected?.name || "Choose a drug"}
                {unitPrice <= 0 ? " · no sale price" : ` · ${money(unitPrice)} each`}
              </p>
            </div>
            <button type="button" className="btn-primary" onClick={onAdd}>
              <Plus size={16} aria-hidden className="mr-1 inline" />
              Add to preview
            </button>
          </div>
        </section>

        <section className="chairside-rx-dialog__preview" aria-labelledby="rx-preview-title">
          <div className="clin-head">
            <h3 id="rx-preview-title" className="chairside-rx-dialog__title">
              2. Preview & billing
            </h3>
            <Link className="btn-ghost text-sm" to="/billing">
              Open billing
            </Link>
          </div>

          {preview.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border px-3 py-4 text-sm text-muted">
              No drugs in the preview yet. Fill the course details and press Add to preview.
            </p>
          ) : (
            <ul className="rx-preview-list">
              {preview.map((line) => (
                <li key={line.key} className="rx-preview-card">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-brand-900">{line.drugName}</p>
                      {line.controlled && <span className="status-pill status-pill--danger">Controlled</span>}
                    </div>
                    <p className="mt-1 text-sm text-muted">
                      {line.frequency} · {line.days} days · qty {line.quantity}
                    </p>
                    <p className="text-xs text-muted">
                      {line.startDate} → {line.endDate}
                      {line.instructions ? ` · ${line.instructions}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <p className="whitespace-nowrap text-sm font-bold text-brand-900">
                      {money(line.quantity * line.unitPrice)}
                    </p>
                    <button
                      type="button"
                      className="btn-ghost"
                      aria-label={`Remove ${line.drugName}`}
                      onClick={() => removeLine(line.key)}
                    >
                      <Trash2 size={16} aria-hidden />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <div className="chairside-rx-dialog__totals" role="status" aria-live="polite">
            <div>
              <p className="label">Total quantity</p>
              <p className="text-lg font-bold text-brand-900">{totals.totalQty}</p>
            </div>
            <div>
              <p className="label">Billing amount</p>
              <p className="text-lg font-bold text-brand-900">{money(totals.billing)}</p>
            </div>
            <p className="chairside-rx-dialog__totals-note text-sm text-muted">
              Save creates the billing invoice, then places the script on the pharmacy queue.
            </p>
          </div>
        </section>
      </form>
    </Modal>
  );
}
