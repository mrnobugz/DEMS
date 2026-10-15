import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import {
  createInvoice,
  fetchFeeSchedule,
  searchPatients,
  type FeeScheduleOption,
} from "@/features/billing/api/billingApi";
import { LINE_KINDS, type BillingInvoice } from "@/features/billing/types";
import type { Patient } from "@/lib/types";

type DraftLine = {
  fee_item_id: string;
  description: string;
  quantity: number;
  unit_price: number;
  line_kind: string;
  procedure_code?: string;
};

const emptyLine = (): DraftLine => ({
  fee_item_id: "",
  description: "",
  quantity: 1,
  unit_price: 0,
  line_kind: "procedure",
});

function kindFromCategory(category: string | undefined): string {
  const value = (category || "").toLowerCase();
  if (value.includes("drug") || value.includes("pharm")) return "drug";
  if (value.includes("lab")) return "lab";
  if (value.includes("imag") || value.includes("radio")) return "imaging";
  if (value.includes("consult")) return "consultation";
  if (value.includes("supply")) return "supply";
  if (value.includes("service")) return "service";
  return "procedure";
}

export function NewInvoiceDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (invoice: BillingInvoice) => void;
}) {
  const [query, setQuery] = useState("");
  const [patients, setPatients] = useState<Patient[]>([]);
  const [patient, setPatient] = useState<Patient | null>(null);
  const [feeItems, setFeeItems] = useState<FeeScheduleOption[]>([]);
  const [feeError, setFeeError] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([emptyLine()]);
  const [tax, setTax] = useState(0);
  const [discount, setDiscount] = useState(0);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => {
      void searchPatients(query.trim())
        .then((page) => setPatients(page.items))
        .catch(() => setPatients([]));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [open, query]);

  useEffect(() => {
    if (!open) return;
    setFeeError("");
    void fetchFeeSchedule(true)
      .then(setFeeItems)
      .catch((err) => {
        setFeeItems([]);
        setFeeError(err instanceof Error ? err.message : "Could not load fee schedule");
      });
  }, [open]);

  const feeById = useMemo(() => new Map(feeItems.map((item) => [item.id, item])), [feeItems]);

  function updateLine(index: number, patch: Partial<DraftLine>) {
    setLines((current) => current.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  }

  function selectFeeItem(index: number, feeItemId: string) {
    if (!feeItemId) {
      updateLine(index, { fee_item_id: "", procedure_code: undefined });
      return;
    }
    const item = feeById.get(feeItemId);
    if (!item) return;
    updateLine(index, {
      fee_item_id: item.id,
      description: item.label,
      unit_price: item.unit_price,
      line_kind: kindFromCategory(item.category),
      procedure_code: item.code,
    });
  }

  async function submit() {
    setError("");
    if (!patient) {
      setError("Choose a patient");
      return;
    }
    const ready = lines.filter((line) => line.description.trim() && line.quantity > 0 && line.unit_price >= 0);
    if (!ready.length) {
      setError("Add at least one line with a billable item or description and price");
      return;
    }
    setBusy(true);
    try {
      const invoice = await createInvoice({
        patient_id: patient.id,
        tax,
        discount,
        notes: notes.trim() || undefined,
        line_items: ready.map((line) => ({
          description: line.description.trim(),
          quantity: line.quantity,
          unit_price: line.unit_price,
          line_kind: line.line_kind,
          procedure_code: line.procedure_code,
        })),
      });
      onCreated(invoice);
      onOpenChange(false);
      setLines([emptyLine()]);
      setNotes("");
      setTax(0);
      setDiscount(0);
      setPatient(null);
      setQuery("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the invoice");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="New invoice" description="Pick fee-schedule items to bill, then save to the ledger." className="max-h-[85vh] overflow-auto">
        <div className="space-y-3">
          <label className="block text-sm">
            <span className="label">Patient</span>
            <input className="input" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name or code" />
          </label>
          {patient && (
            <p className="text-sm">
              Selected: <strong>{patient.first_name} {patient.last_name}</strong> · {patient.patient_code}
            </p>
          )}
          <ul className="max-h-32 space-y-1 overflow-auto">
            {patients.map((row) => (
              <li key={row.id}>
                <button type="button" className="btn-ghost w-full justify-start text-sm" onClick={() => setPatient(row)}>
                  {row.first_name} {row.last_name} · {row.patient_code}
                </button>
              </li>
            ))}
          </ul>
          {feeError && (
            <p className="text-sm text-danger" role="alert">
              {feeError}
            </p>
          )}
          {lines.map((line, index) => (
            <div key={index} className="grid gap-2 rounded-lg border border-border/70 p-3 sm:grid-cols-4">
              <label className="block text-sm sm:col-span-4">
                <span className="label">Billable item</span>
                <select
                  className="input"
                  value={line.fee_item_id}
                  onChange={(event) => selectFeeItem(index, event.target.value)}
                  required={!line.description.trim()}
                >
                  <option value="">Select from fee schedule…</option>
                  {feeItems.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.code} — {item.label} ({item.unit_price.toLocaleString()})
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm sm:col-span-2">
                <span className="label">Description</span>
                <input
                  className="input"
                  value={line.description}
                  onChange={(event) => updateLine(index, { description: event.target.value, fee_item_id: "" })}
                />
              </label>
              <label className="block text-sm">
                <span className="label">Qty</span>
                <input
                  className="input tabular-nums"
                  type="number"
                  min={1}
                  value={line.quantity}
                  onChange={(event) => updateLine(index, { quantity: Number(event.target.value) })}
                />
              </label>
              <label className="block text-sm">
                <span className="label">Price</span>
                <input
                  className="input tabular-nums"
                  type="number"
                  min={0}
                  value={line.unit_price}
                  onChange={(event) => updateLine(index, { unit_price: Number(event.target.value) })}
                />
              </label>
              <label className="block text-sm sm:col-span-2">
                <span className="label">Kind</span>
                <select className="input" value={line.line_kind} onChange={(event) => updateLine(index, { line_kind: event.target.value })}>
                  {LINE_KINDS.map((kind) => (
                    <option key={kind.value} value={kind.value}>{kind.label}</option>
                  ))}
                </select>
              </label>
            </div>
          ))}
          <Button variant="ghost" onClick={() => setLines((current) => [...current, emptyLine()])}>Add line</Button>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="label">Tax</span>
              <input className="input tabular-nums" type="number" min={0} value={tax} onChange={(event) => setTax(Number(event.target.value))} />
            </label>
            <label className="block text-sm">
              <span className="label">Discount</span>
              <input className="input tabular-nums" type="number" min={0} value={discount} onChange={(event) => setDiscount(Number(event.target.value))} />
            </label>
          </div>
          <label className="block text-sm">
            <span className="label">Notes</span>
            <input className="input" value={notes} onChange={(event) => setNotes(event.target.value)} />
          </label>
          {error && <p className="text-sm text-danger" role="alert">{error}</p>}
          <div className="flex justify-end">
            <Button onClick={() => void submit()} disabled={busy}>{busy ? "Saving…" : "Create invoice"}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
