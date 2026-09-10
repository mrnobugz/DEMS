import { FormEvent, useEffect, useMemo, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { formatMoney } from "@/lib/i18n";
import type { FeeScheduleItem, Invoice, Page, Patient } from "@/lib/types";
import { useUiPrefs } from "@/lib/uiPrefs";

type QtyMap = Record<string, number>;

const KIND_RE: Record<string, RegExp> = {
  imaging: /opg|cbct|pa\b|bitewing|\bbw\b|radio|x-?ray|photo|imaging|pano|ceph/i,
  surgery: /extract|surg|implant|biopsy|impact|fracture|cyst|third|wisdom|orif|enucleat/i,
};

export function ProcedureInvoicePanel({
  patientId,
  onDone,
  title = "Bill procedures",
  hint = "Use the admin catalog. Prices cannot be changed here.",
  kind = "all",
}: {
  patientId?: string;
  onDone?: (invoice: Invoice) => void;
  title?: string;
  hint?: string;
  kind?: "all" | "imaging" | "surgery";
}) {
  const currency = useUiPrefs((s) => s.currency);
  const locale = useUiPrefs((s) => s.locale);
  const money = (n: number) => formatMoney(n, currency, locale);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [catalog, setCatalog] = useState<FeeScheduleItem[]>([]);
  const [selected, setSelected] = useState(patientId || "");
  const [qty, setQty] = useState<QtyMap>({});
  const [tooth, setTooth] = useState("");
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (patientId) setSelected(patientId);
  }, [patientId]);

  useEffect(() => {
    api<FeeScheduleItem[]>("/api/v1/billing/fee-schedule?billable=true&active=true")
      .then((rows) => {
        const priced = rows.filter((row) => row.unit_price > 0);
        const re = kind === "all" ? null : KIND_RE[kind];
        const filtered = re
          ? priced.filter(
              (row) =>
                row.category === kind || re.test(`${row.code} ${row.label} ${row.category}`),
            )
          : priced;
        setCatalog(filtered.length ? filtered : priced);
      })
      .catch(() => setCatalog([]));
    if (!patientId) {
      api<Page<Patient>>("/api/v1/patients?limit=100")
        .then((p) => setPatients(p.items))
        .catch(() => setPatients([]));
    }
  }, [patientId, kind]);

  const picked = useMemo(
    () => catalog.filter((row) => (qty[row.id] || 0) > 0),
    [catalog, qty],
  );
  const total = picked.reduce((sum, row) => sum + row.unit_price * (qty[row.id] || 0), 0);

  function toggle(id: string) {
    setQty((prev) => ({ ...prev, [id]: prev[id] ? 0 : 1 }));
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setMsg("");
    if (!selected || picked.length === 0) {
      setError("Choose a patient and at least one procedure");
      return;
    }
    setBusy(true);
    try {
      const invoice = await api<Invoice>("/api/v1/billing/invoices/from-procedures", {
        method: "POST",
        body: JSON.stringify({
          patient_id: selected,
          items: picked.map((row) => ({
            fee_item_id: row.id,
            quantity: qty[row.id] || 1,
            tooth_number: tooth.trim() || null,
          })),
          notes: "Procedural invoice",
          idempotency_key: crypto.randomUUID(),
        }),
      });
      setQty({});
      setMsg(`Invoice ${invoice.invoice_number} · ${money(invoice.total)}`);
      onDone?.(invoice);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create invoice");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="glass-panel space-y-2" onSubmit={submit}>
      <div>
        <h3 className="font-display text-base font-bold text-brand-900">{title}</h3>
        <p className="text-xs text-muted">{hint}</p>
      </div>
      {!patientId && (
        <div>
          <label className="label">Patient</label>
          <select className="input" value={selected} onChange={(e) => setSelected(e.target.value)} required>
            <option value="">— select patient —</option>
            {patients.map((p) => (
              <option key={p.id} value={p.id}>
                {p.patient_code} · {p.first_name} {p.last_name}
              </option>
            ))}
          </select>
        </div>
      )}
      <div>
        <label className="label">Tooth (optional, applies to this invoice)</label>
        <input
          className="input"
          value={tooth}
          onChange={(e) => setTooth(e.target.value)}
          placeholder="e.g. 36"
        />
      </div>
      {catalog.length === 0 ? (
        <p className="text-xs text-muted">
          No billable procedures yet. Ask an admin to add them under Clinic admin.
        </p>
      ) : (
        <ul className="max-h-56 space-y-1 overflow-auto">
          {catalog.map((row) => {
            const on = (qty[row.id] || 0) > 0;
            return (
              <li key={row.id}>
                <label className={`reg-sku ${on ? "reg-sku--on" : ""}`}>
                  <input type="checkbox" checked={on} onChange={() => toggle(row.id)} />
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold text-brand-900">{row.label}</span>
                    <span className="font-mono text-[11px] text-muted">
                      {row.code} · {row.category}
                    </span>
                  </span>
                  <span className="text-xs font-bold">{money(row.unit_price)}</span>
                  {on && (
                    <input
                      type="number"
                      min={1}
                      max={20}
                      className="input w-16"
                      value={qty[row.id]}
                      onChange={(e) =>
                        setQty((prev) => ({
                          ...prev,
                          [row.id]: Math.max(1, Number(e.target.value) || 1),
                        }))
                      }
                    />
                  )}
                </label>
              </li>
            );
          })}
        </ul>
      )}
      <div className="flex items-center justify-between text-sm">
        <span className="text-xs text-muted">Due</span>
        <span className="font-display font-bold text-brand-900">{money(total)}</span>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {msg && <p className="text-sm text-brand-700">{msg}</p>}
      <button className="btn-primary" type="submit" disabled={busy || !selected || picked.length === 0}>
        {busy ? "Creating…" : "Generate invoice"}
      </button>
    </form>
  );
}
