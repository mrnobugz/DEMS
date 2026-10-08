import { FormEvent, useState } from "react";
import { ConfigField, ConfigStatus, ConfirmAction } from "@/components/config/ConfigUi";
import { Modal } from "@/components/Modal";
import { api } from "@/lib/api";
import type { InventoryItem, StockLocation } from "@/lib/types";

const CATEGORIES = ["clinical", "consumable", "drug", "linen", "instrument", "general"];
const UNITS = ["unit", "piece", "box", "pack", "bottle", "vial", "roll", "pair", "kit"];

const SAMPLE_CSV = `sku,name,category,unit,quantity,reorder_level,unit_cost,sale_price,expiry_date,requires_expiry,track_lots
GLOVE-M,Sterile gloves medium,clinical,box,0,5,12000,18000,,yes,no
COMP-A,Composite A2,clinical,unit,10,2,45000,0,2027-12-31,yes,yes
`;

type SkuForm = {
  sku: string;
  name: string;
  category: string;
  categoryOther: string;
  unit: string;
  unitOther: string;
  quantity: number;
  reorder_level: number;
  unit_cost: number;
  sale_price: number;
  expiry_date: string;
  track_lots: boolean;
  requires_expiry: boolean;
  notes: string;
};

function explainFailure(err: unknown, fallback: string) {
  const detail = err instanceof Error ? err.message.trim() : "";
  const lead = detail && !/^error\s*\d+/i.test(detail) ? detail : fallback;
  if (/try again\.?$/i.test(lead)) return lead;
  return `${lead} Check your connection and try again.`;
}

const emptyForm = (): SkuForm => ({
  sku: "",
  name: "",
  category: "clinical",
  categoryOther: "",
  unit: "unit",
  unitOther: "",
  quantity: 0,
  reorder_level: 5,
  unit_cost: 0,
  sale_price: 0,
  expiry_date: "",
  track_lots: false,
  requires_expiry: true,
  notes: "",
});

function chosen(value: string, other: string, fallback: string) {
  const picked = value === "other" ? other.trim() : value.trim();
  return picked || fallback;
}

export function AddSkuDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => Promise<void>;
}) {
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [touched, setTouched] = useState({ sku: false, name: false, expiry: false });
  const needExpiry = form.quantity > 0 && form.requires_expiry;
  const skuIssue = touched.sku && !form.sku.trim() ? "Enter a SKU code." : "";
  const nameIssue = touched.name && !form.name.trim() ? "Enter the item name." : "";
  const expiryIssue = touched.expiry && needExpiry && !form.expiry_date
    ? "Opening quantity needs an expiry date, or set the opening quantity to zero."
    : "";

  function markTouched(field: "sku" | "name" | "expiry") {
    setTouched((prev) => ({ ...prev, [field]: true }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setTouched({ sku: true, name: true, expiry: true });
    setError("");
    const sku = form.sku.trim();
    const name = form.name.trim();
    if (!sku || !name) {
      setError("Enter a SKU and a name.");
      return;
    }
    if (needExpiry && !form.expiry_date) {
      setError("Opening quantity needs an expiry date, or set the opening quantity to zero.");
      return;
    }
    setBusy(true);
    try {
      await api("/api/v1/inventory", {
        method: "POST",
        body: JSON.stringify({
          sku,
          name,
          category: chosen(form.category, form.categoryOther, "general"),
          quantity: form.quantity,
          reorder_level: form.reorder_level,
          unit: chosen(form.unit, form.unitOther, "unit"),
          unit_cost: form.unit_cost,
          sale_price: form.sale_price,
          item_kind: "stock",
          track_lots: form.track_lots,
          requires_expiry: form.requires_expiry,
          expiry_date: form.expiry_date || null,
          notes: form.notes.trim() || null,
        }),
      });
      await onCreated();
    } catch (err: unknown) {
      setError(explainFailure(err, "Could not add this SKU."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title="Add SKU"
      subtitle="Create one stock item. Opening quantity is received into the main store."
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn-ghost" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="submit" form="add-sku-form" className="btn-primary" disabled={busy}>
            {busy ? "Saving…" : "Add SKU"}
          </button>
        </>
      }
    >
      <form id="add-sku-form" className="grid grid-cols-1 gap-4 md:grid-cols-2" onSubmit={handleSubmit}>
        <div className="md:col-span-2">
          <ConfigStatus error={error} />
        </div>
        <ConfigField label="SKU" hint={skuIssue ? undefined : "Short code used on requests and labels."}>
          <input
            className="input"
            value={form.sku}
            onChange={(e) => setForm({ ...form, sku: e.target.value })}
            onBlur={() => markTouched("sku")}
            aria-invalid={skuIssue ? true : undefined}
            required
            autoComplete="off"
          />
          {skuIssue && <span className="text-sm text-danger" role="alert">{skuIssue}</span>}
        </ConfigField>
        <ConfigField label="Name">
          <input
            className="input"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            onBlur={() => markTouched("name")}
            aria-invalid={nameIssue ? true : undefined}
            required
          />
          {nameIssue && <span className="text-sm text-danger" role="alert">{nameIssue}</span>}
        </ConfigField>
        <ConfigField label="Category">
          <select className="input" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
            <option value="other">Other</option>
          </select>
        </ConfigField>
        {form.category === "other" && (
          <ConfigField label="Other category">
            <input className="input" value={form.categoryOther} onChange={(e) => setForm({ ...form, categoryOther: e.target.value })} required />
          </ConfigField>
        )}
        <ConfigField label="Unit">
          <select className="input" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })}>
            {UNITS.map((u) => (
              <option key={u} value={u}>{u}</option>
            ))}
            <option value="other">Other</option>
          </select>
        </ConfigField>
        {form.unit === "other" && (
          <ConfigField label="Other unit">
            <input className="input" value={form.unitOther} onChange={(e) => setForm({ ...form, unitOther: e.target.value })} required />
          </ConfigField>
        )}
        <ConfigField label="Opening quantity" hint="Zero leaves the item empty until you receive stock.">
          <input className="input" type="number" min={0} step="any" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: Number(e.target.value) })} />
        </ConfigField>
        <ConfigField label="Reorder level">
          <input className="input" type="number" min={0} step="any" value={form.reorder_level} onChange={(e) => setForm({ ...form, reorder_level: Number(e.target.value) })} />
        </ConfigField>
        <ConfigField label="Unit cost">
          <input className="input" type="number" min={0} step="any" value={form.unit_cost} onChange={(e) => setForm({ ...form, unit_cost: Number(e.target.value) })} />
        </ConfigField>
        <ConfigField label="Sale price">
          <input className="input" type="number" min={0} step="any" value={form.sale_price} onChange={(e) => setForm({ ...form, sale_price: Number(e.target.value) })} />
        </ConfigField>
        {needExpiry && (
          <ConfigField label="Expiry date" hint={expiryIssue ? undefined : "Required because this opening quantity is a dated supply."}>
            <input
              className="input"
              type="date"
              value={form.expiry_date}
              onChange={(e) => setForm({ ...form, expiry_date: e.target.value })}
              onBlur={() => markTouched("expiry")}
              aria-invalid={expiryIssue ? true : undefined}
              required
            />
            {expiryIssue && <span className="text-sm text-danger" role="alert">{expiryIssue}</span>}
          </ConfigField>
        )}
        <ConfigField label="Notes">
          <input className="input" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </ConfigField>
        <label className="choice-row">
          <input type="checkbox" checked={form.track_lots} onChange={(e) => setForm({ ...form, track_lots: e.target.checked })} />
          Track lots
        </label>
        <label className="choice-row">
          <input type="checkbox" checked={form.requires_expiry} onChange={(e) => setForm({ ...form, requires_expiry: e.target.checked })} />
          Requires expiry when received
        </label>
      </form>
    </Modal>
  );
}

type ImportRow = {
  line: number;
  sku: string;
  name: string;
  issue: string;
  payload: Record<string, unknown> | null;
};

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const src = text.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]!;
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else quoted = false;
      } else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell.length || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

function parseBool(raw: string | undefined, fallback: boolean) {
  if (raw == null || raw.trim() === "") return fallback;
  const v = raw.trim().toLowerCase();
  if (["1", "true", "yes", "y"].includes(v)) return true;
  if (["0", "false", "no", "n"].includes(v)) return false;
  return fallback;
}

function parseNum(raw: string | undefined, fallback: number): number | null {
  if (raw == null || raw.trim() === "") return fallback;
  const n = Number(raw.replace(/,/g, "").trim());
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

function rowsFromCsv(text: string): { rows: ImportRow[]; error: string } {
  const table = parseCsv(text);
  if (table.length < 2) return { rows: [], error: "The file needs a header row and at least one SKU." };
  const header = table[0]!.map((h) => h.trim().toLowerCase().replace(/\s+/g, "_"));
  const idx = (name: string) => header.indexOf(name);
  if (idx("sku") < 0 || idx("name") < 0) {
    return { rows: [], error: "The header must include sku and name columns." };
  }
  if (table.length - 1 > 300) return { rows: [], error: "Import at most 300 SKUs at a time." };
  const seen = new Set<string>();
  const rows: ImportRow[] = [];
  for (let i = 1; i < table.length; i++) {
    const cells = table[i]!;
    const cell = (name: string) => {
      const at = idx(name);
      return at < 0 ? "" : (cells[at] || "").trim();
    };
    const sku = cell("sku");
    const name = cell("name");
    const quantity = parseNum(cell("quantity"), 0);
    const reorder = parseNum(cell("reorder_level"), 0);
    const cost = parseNum(cell("unit_cost"), 0);
    const sale = parseNum(cell("sale_price"), 0);
    const requires = parseBool(cell("requires_expiry"), true);
    const expiry = cell("expiry_date");
    const line = i + 1;
    let issue = "";
    if (!sku || !name) issue = "SKU and name are required.";
    else if (quantity == null || reorder == null || cost == null || sale == null) issue = "Quantities and prices must be zero or greater.";
    else if (expiry && !/^\d{4}-\d{2}-\d{2}$/.test(expiry)) issue = "Expiry date must be YYYY-MM-DD.";
    else if (quantity > 0 && requires && !expiry) issue = "Opening quantity needs an expiry date.";
    else if (seen.has(sku.toLowerCase())) issue = "Repeated in this file.";
    if (!issue && sku) seen.add(sku.toLowerCase());
    rows.push({
      line,
      sku,
      name,
      issue,
      payload: issue
        ? null
        : {
            sku,
            name,
            category: cell("category") || "general",
            unit: cell("unit") || "unit",
            quantity,
            reorder_level: reorder,
            unit_cost: cost,
            sale_price: sale,
            expiry_date: expiry || null,
            requires_expiry: requires,
            track_lots: parseBool(cell("track_lots"), false),
            item_kind: "stock",
          },
    });
  }
  return { rows, error: "" };
}

export function ImportSkuDialog({
  onClose,
  onImported,
}: {
  onClose: () => void;
  onImported: () => Promise<void>;
}) {
  const [text, setText] = useState("");
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [parseError, setParseError] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [serverErrors, setServerErrors] = useState<{ line: number; sku: string; message: string }[]>([]);

  function loadText(next: string) {
    setText(next);
    setOk("");
    setError("");
    setServerErrors([]);
    const parsed = rowsFromCsv(next);
    setRows(parsed.rows);
    setParseError(parsed.error);
  }

  function downloadSample() {
    const blob = new Blob([SAMPLE_CSV], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "sku-import-sample.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  async function runImport() {
    const ready = rows.filter((row) => row.payload);
    if (!ready.length) {
      setError("Fix the rows in the preview before importing.");
      return;
    }
    setBusy(true);
    setError("");
    setOk("");
    setServerErrors([]);
    try {
      const result = await api<{ created: number; errors: { row: number; sku: string; message: string }[] }>(
        "/api/v1/inventory/import",
        { method: "POST", body: JSON.stringify({ items: ready.map((row) => row.payload) }) },
      );
      const mapped = result.errors.map((err) => ({
        line: ready[err.row - 1]?.line ?? err.row,
        sku: err.sku,
        message: err.message,
      }));
      const local = rows
        .filter((row) => row.issue)
        .map((row) => ({ line: row.line, sku: row.sku, message: row.issue }));
      setServerErrors([...local, ...mapped]);
      setOk(
        result.created
          ? `Added ${result.created} SKU${result.created === 1 ? "" : "s"}.`
          : "No new SKUs were added.",
      );
      if (result.created) await onImported();
    } catch (err: unknown) {
      setError(explainFailure(err, "Import failed."));
    } finally {
      setBusy(false);
    }
  }

  const preview = rows.slice(0, 8);
  const readyCount = rows.filter((row) => row.payload).length;

  return (
    <Modal
      title="Import SKUs"
      subtitle="Paste a spreadsheet or choose a CSV file. Valid rows are added. Rows that fail stay listed."
      onClose={onClose}
      headerActions={
        <button type="button" className="btn-ghost" onClick={downloadSample}>
          Download sample
        </button>
      }
      footer={
        <>
          <button type="button" className="btn-ghost" onClick={onClose} disabled={busy}>
            Close
          </button>
          <button type="button" className="btn-primary" onClick={() => void runImport()} disabled={busy || readyCount === 0}>
            {busy ? "Importing…" : `Import ${readyCount} SKU${readyCount === 1 ? "" : "s"}`}
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <ConfigStatus error={error || parseError} ok={ok} />
        <ConfigField label="CSV file">
          <input
            className="input"
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              file.text().then(loadText).catch(() => setParseError("Could not read that file."));
            }}
          />
        </ConfigField>
        <ConfigField
          label="Or paste CSV"
          hint="Columns: sku, name, category, unit, quantity, reorder_level, unit_cost, sale_price, expiry_date, requires_expiry, track_lots."
        >
          <textarea
            className="input import-paste"
            value={text}
            onChange={(e) => loadText(e.target.value)}
          />
        </ConfigField>
        {rows.length > 0 && (
          <div className="admin-scroll">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Line</th>
                  <th>SKU</th>
                  <th>Name</th>
                  <th>Check</th>
                </tr>
              </thead>
              <tbody>
                {preview.map((row) => (
                  <tr key={row.line}>
                    <td>{row.line}</td>
                    <td className="font-mono text-xs">{row.sku || "—"}</td>
                    <td>{row.name || "—"}</td>
                    <td>{row.issue || "Ready"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length > preview.length && (
              <p className="text-sm text-muted">And {rows.length - preview.length} more rows.</p>
            )}
          </div>
        )}
        {serverErrors.length > 0 && (
          <div className="admin-scroll">
            <table className="admin-table">
              <caption className="label text-left">Rows not added</caption>
              <thead>
                <tr>
                  <th>Line</th>
                  <th>SKU</th>
                  <th>Reason</th>
                </tr>
              </thead>
              <tbody>
                {serverErrors.map((row) => (
                  <tr key={`${row.line}-${row.sku}-${row.message}`}>
                    <td>{row.line}</td>
                    <td className="font-mono text-xs">{row.sku || "—"}</td>
                    <td>{row.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Modal>
  );
}

export function EditSkuDialog({
  item,
  locations,
  onClose,
  onSaved,
}: {
  item: InventoryItem;
  locations: StockLocation[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [draft, setDraft] = useState<InventoryItem>(item);
  const [counted, setCounted] = useState(item.quantity);
  const [writeQty, setWriteQty] = useState(1);
  const [writeReason, setWriteReason] = useState("damaged");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const categories = CATEGORIES.includes(draft.category) ? CATEGORIES : [draft.category, ...CATEGORIES];
  const units = UNITS.includes(draft.unit) ? UNITS : [draft.unit, ...UNITS];

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setOk("");
    try {
      await api(`/api/v1/inventory/${item.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: draft.name.trim(),
          category: draft.category.trim() || "general",
          reorder_level: draft.reorder_level,
          unit: draft.unit.trim() || "unit",
          unit_cost: draft.unit_cost,
          sale_price: draft.sale_price,
          notes: draft.notes || null,
          expiry_date: draft.expiry_date || null,
          track_lots: !!draft.track_lots,
          requires_expiry: draft.requires_expiry !== false,
        }),
      });
      setOk("Saved.");
      await onSaved();
    } catch (err: unknown) {
      setError(explainFailure(err, "Could not save this SKU."));
    } finally {
      setBusy(false);
    }
  }

  async function postStocktake() {
    setError("");
    try {
      await api("/api/v1/inventory/stocktake", {
        method: "POST",
        body: JSON.stringify({
          inventory_item_id: item.id,
          counted,
          reason: "cycle count",
        }),
      });
      await onSaved();
    } catch (err: unknown) {
      setError(explainFailure(err, "Stocktake failed."));
    }
  }

  async function postWriteoff() {
    setError("");
    try {
      await api("/api/v1/inventory/writeoff", {
        method: "POST",
        body: JSON.stringify({
          inventory_item_id: item.id,
          quantity: writeQty,
          reason: writeReason,
        }),
      });
      await onSaved();
    } catch (err: unknown) {
      setError(explainFailure(err, "Write-off failed."));
    }
  }

  return (
    <Modal
      title={`Edit ${item.sku}`}
      subtitle={item.name}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn-ghost" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="submit" form="edit-sku-form" className="btn-primary" disabled={busy}>
            {busy ? "Saving…" : "Save SKU"}
          </button>
        </>
      }
    >
      <form id="edit-sku-form" className="grid grid-cols-1 gap-4 md:grid-cols-2" onSubmit={save}>
        <div className="md:col-span-2">
          <ConfigStatus error={error} ok={ok} />
        </div>
        <ConfigField label="Name">
          <input className="input" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} required />
        </ConfigField>
        <ConfigField label="Category">
          <select className="input" value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })}>
            {categories.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </ConfigField>
        <ConfigField label="Unit">
          <select className="input" value={draft.unit} onChange={(e) => setDraft({ ...draft, unit: e.target.value })}>
            {units.map((u) => (
              <option key={u} value={u}>{u}</option>
            ))}
          </select>
        </ConfigField>
        <ConfigField label="Reorder level">
          <input className="input" type="number" min={0} step="any" value={draft.reorder_level} onChange={(e) => setDraft({ ...draft, reorder_level: Number(e.target.value) })} />
        </ConfigField>
        <ConfigField label="Unit cost">
          <input className="input" type="number" min={0} step="any" value={draft.unit_cost} onChange={(e) => setDraft({ ...draft, unit_cost: Number(e.target.value) })} />
        </ConfigField>
        <ConfigField label="Sale price">
          <input className="input" type="number" min={0} step="any" value={draft.sale_price} onChange={(e) => setDraft({ ...draft, sale_price: Number(e.target.value) })} />
        </ConfigField>
        <ConfigField label="Expiry date">
          <input className="input" type="date" value={draft.expiry_date || ""} onChange={(e) => setDraft({ ...draft, expiry_date: e.target.value })} />
        </ConfigField>
        <ConfigField label="Notes">
          <input className="input" value={draft.notes || ""} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} />
        </ConfigField>
        <label className="choice-row">
          <input type="checkbox" checked={!!draft.track_lots} onChange={(e) => setDraft({ ...draft, track_lots: e.target.checked })} />
          Track lots
        </label>
        <label className="choice-row">
          <input
            type="checkbox"
            checked={draft.requires_expiry !== false}
            onChange={(e) => setDraft({ ...draft, requires_expiry: e.target.checked })}
          />
          Requires expiry when received
        </label>
        {locations.length > 0 && (
          <div className="md:col-span-2 grid gap-3 border-t border-[var(--demsta-border)] pt-3 md:grid-cols-2">
            <ConfigField label="Counted quantity" hint="Sets the clinic quantity to this count.">
              <input className="input" type="number" min={0} step="any" value={counted} onChange={(e) => setCounted(Number(e.target.value))} />
            </ConfigField>
            <div className="flex items-end">
              <ConfirmAction label="Save count" confirmLabel="Apply count" onConfirm={postStocktake} />
            </div>
            <ConfigField label="Write-off quantity">
              <input className="input" type="number" min={0.01} step="any" value={writeQty} onChange={(e) => setWriteQty(Number(e.target.value))} />
            </ConfigField>
            <ConfigField label="Write-off reason">
              <select className="input" value={writeReason} onChange={(e) => setWriteReason(e.target.value)}>
                <option value="damaged">Damaged</option>
                <option value="expired">Expired</option>
                <option value="waste">Waste</option>
              </select>
            </ConfigField>
            <div>
              <ConfirmAction label={`Write off ${writeQty}`} confirmLabel="Write off" onConfirm={postWriteoff} />
            </div>
          </div>
        )}
      </form>
    </Modal>
  );
}
