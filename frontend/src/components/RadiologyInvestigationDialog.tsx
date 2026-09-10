import { ClipboardEvent, DragEvent, useEffect, useMemo, useRef, useState } from "react";
import { api, apiUpload, ApiError } from "@/lib/api";
import { formatMoney } from "@/lib/i18n";
import type {
  FeeScheduleItem,
  Invoice,
  RadiologyInvestigationItem,
} from "@/lib/types";
import { useUiPrefs } from "@/lib/uiPrefs";

const IMAGING_RE = /opg|cbct|pa\b|bitewing|\bbw\b|radio|x-?ray|photo|imaging|pano|ceph/i;

export function formatRadiologyOverview(item: {
  type_label: string;
  region?: string | null;
  quantity?: number | null;
  comment?: string | null;
}): string {
  const parts = [item.type_label.trim() || "Radiology"];
  const region = (item.region || "").trim();
  if (region) parts.push(region);
  parts.push(`×${Math.max(1, item.quantity || 1)}`);
  const comment = (item.comment || "").trim();
  if (comment) parts.push(comment);
  return parts.join(" · ");
}

function studyTypeFromFee(code: string, label: string): string {
  const text = `${code} ${label}`.toLowerCase();
  if (/cbct/.test(text)) return "CBCT";
  if (/opg|pano/.test(text)) return "OPG";
  if (/\bbw\b|bitewing/.test(text)) return "BW";
  if (/photo/.test(text)) return "photo";
  if (/pa\b|periapical/.test(text)) return "PA";
  return "PA";
}

function fileFromClipboard(e: ClipboardEvent<HTMLElement>): File | null {
  const items = e.clipboardData?.items;
  if (!items) return null;
  for (const item of items) {
    if (item.type.startsWith("image/")) {
      return item.getAsFile();
    }
  }
  const files = e.clipboardData?.files;
  return files?.[0] && files[0].type.startsWith("image/") ? files[0] : null;
}

function fileFromDrop(e: DragEvent<HTMLElement>): File | null {
  const file = e.dataTransfer?.files?.[0];
  return file || null;
}

type DraftRow = RadiologyInvestigationItem & {
  localId: string;
  file?: File | null;
  previewUrl?: string | null;
};

function emptyDraft(): {
  fee_item_id: string;
  region: string;
  quantity: number;
  comment: string;
  file: File | null;
  previewUrl: string | null;
} {
  return {
    fee_item_id: "",
    region: "",
    quantity: 1,
    comment: "",
    file: null,
    previewUrl: null,
  };
}

function toSavedItem(row: DraftRow): RadiologyInvestigationItem {
  return {
    fee_item_id: row.fee_item_id,
    type_label: row.type_label,
    type_code: row.type_code || null,
    unit_price: row.unit_price ?? null,
    region: row.region || null,
    quantity: row.quantity,
    comment: row.comment || null,
    study_id: row.study_id || null,
    invoice_id: row.invoice_id || null,
    overview: row.overview || formatRadiologyOverview(row),
  };
}

export function RadiologyInvestigationDialog({
  patientId,
  visitId,
  items,
  onSave,
  onClose,
  onMessage,
}: {
  patientId: string;
  visitId?: string | null;
  items: RadiologyInvestigationItem[];
  onSave: (items: RadiologyInvestigationItem[]) => void;
  onClose: () => void;
  onMessage: (msg: string) => void;
}) {
  const currency = useUiPrefs((s) => s.currency);
  const locale = useUiPrefs((s) => s.locale);
  const money = (n: number) => formatMoney(n, currency, locale);
  const fileRef = useRef<HTMLInputElement>(null);
  const [catalog, setCatalog] = useState<FeeScheduleItem[]>([]);
  const [queued, setQueued] = useState<DraftRow[]>(() =>
    items.map((row) => ({
      ...row,
      quantity: row.quantity || 1,
      localId: crypto.randomUUID(),
      overview: row.overview || formatRadiologyOverview(row),
    })),
  );
  const [draft, setDraft] = useState(emptyDraft);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<FeeScheduleItem[]>("/api/v1/billing/fee-schedule?billable=true&active=true")
      .then((rows) => {
        const imaging = rows.filter(
          (row) =>
            row.unit_price > 0 &&
            (row.category === "imaging" || IMAGING_RE.test(`${row.code} ${row.label} ${row.category}`)),
        );
        setCatalog(imaging.length ? imaging : rows.filter((row) => row.unit_price > 0));
      })
      .catch(() => setCatalog([]));
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !busy) onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  useEffect(() => {
    return () => {
      queued.forEach((row) => {
        if (row.previewUrl) URL.revokeObjectURL(row.previewUrl);
      });
      if (draft.previewUrl) URL.revokeObjectURL(draft.previewUrl);
    };
    // Revoke object URLs only when the dialog unmounts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selected = useMemo(
    () => catalog.find((row) => row.id === draft.fee_item_id) || null,
    [catalog, draft.fee_item_id],
  );

  function attachFile(file: File | null) {
    setDraft((prev) => {
      if (prev.previewUrl) URL.revokeObjectURL(prev.previewUrl);
      return {
        ...prev,
        file,
        previewUrl: file ? URL.createObjectURL(file) : null,
      };
    });
  }

  function buildDraftRow(): DraftRow | null {
    if (!selected) return null;
    const next: DraftRow = {
      localId: crypto.randomUUID(),
      fee_item_id: selected.id,
      type_label: selected.label,
      type_code: selected.code,
      unit_price: selected.unit_price,
      region: draft.region.trim() || null,
      quantity: Math.max(1, draft.quantity || 1),
      comment: draft.comment.trim() || null,
      study_id: null,
      invoice_id: null,
      overview: "",
      file: draft.file,
      previewUrl: draft.previewUrl,
    };
    next.overview = formatRadiologyOverview(next);
    return next;
  }

  function commitDraft(resetType: boolean): boolean {
    setError("");
    const next = buildDraftRow();
    if (!next) {
      setError("Choose a radiology type");
      return false;
    }
    setQueued((prev) => [...prev, next]);
    setDraft(resetType ? emptyDraft() : { ...emptyDraft(), fee_item_id: selected?.id || "" });
    if (fileRef.current) fileRef.current.value = "";
    return true;
  }

  function addRow() {
    commitDraft(false);
  }

  function addAnother() {
    commitDraft(true);
  }

  function removeQueued(localId: string) {
    setQueued((prev) => {
      const row = prev.find((item) => item.localId === localId);
      if (row?.previewUrl) URL.revokeObjectURL(row.previewUrl);
      return prev.filter((item) => item.localId !== localId);
    });
  }

  async function uploadImage(row: DraftRow): Promise<string | null> {
    if (!row.file) return row.study_id || null;
    const study = await api<{ id: string }>("/api/v1/imaging/studies", {
      method: "POST",
      body: JSON.stringify({
        patient_id: patientId,
        visit_id: visitId || null,
        study_type: studyTypeFromFee(row.type_code || "", row.type_label),
        tooth: row.region || null,
        notes: row.comment || row.overview || row.type_label,
      }),
    });
    const fd = new FormData();
    fd.append("file", row.file, row.file.name);
    await apiUpload(`/api/v1/imaging/studies/${study.id}/upload`, fd);
    return study.id;
  }

  async function saveAll() {
    setError("");
    const pending = buildDraftRow();
    if (!pending && (draft.region.trim() || draft.comment.trim() || draft.file)) {
      setError("Choose a radiology type");
      return;
    }
    const working = pending ? [...queued, pending] : queued;
    if (working.length === 0) {
      setError("Add at least one radiology type");
      return;
    }

    setBusy(true);
    try {
      const uploaded: DraftRow[] = [];
      for (const row of working) {
        try {
          const studyId = await uploadImage(row);
          uploaded.push({ ...row, study_id: studyId });
        } catch (err) {
          uploaded.push(row);
          onMessage(err instanceof ApiError ? err.message : "Image could not be uploaded");
        }
      }

      const toBill = uploaded.filter((row) => !row.invoice_id && (row.unit_price || 0) > 0);
      let invoice: Invoice | null = null;
      if (toBill.length) {
        try {
          invoice = await api<Invoice>("/api/v1/billing/invoices/from-procedures", {
            method: "POST",
            body: JSON.stringify({
              patient_id: patientId,
              items: toBill.map((row) => ({
                fee_item_id: row.fee_item_id,
                quantity: row.quantity || 1,
                tooth_number: row.region || null,
              })),
              notes: "Radiology investigation",
              idempotency_key: crypto.randomUUID(),
            }),
          });
        } catch (err) {
          onMessage(
            err instanceof ApiError
              ? `Radiology recorded, but billing failed: ${err.message}`
              : "Radiology recorded, but the invoice could not be created",
          );
        }
      }

      const saved = uploaded.map((row) =>
        toSavedItem({
          ...row,
          invoice_id: row.invoice_id || invoice?.id || null,
        }),
      );
      onSave(saved);
      onMessage(
        invoice
          ? `Radiology saved · invoice ${invoice.invoice_number}`
          : "Radiology saved on this exam",
      );
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save radiology");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="ix-dialog-backdrop" role="presentation">
      <div
        className="ix-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="radiology-dialog-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h3 id="radiology-dialog-title" className="font-display text-base font-bold text-brand-900">
              Radiology
            </h3>
            <p className="text-xs text-muted">
              Types and prices come from Clinic admin. Save generates the billing invoice.
            </p>
          </div>
          <button type="button" className="btn-ghost text-xs" onClick={onClose} disabled={busy}>
            Close
          </button>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="label" htmlFor="radiology-type">
              Type
            </label>
            <select
              id="radiology-type"
              className="input"
              value={draft.fee_item_id}
              onChange={(e) => setDraft((prev) => ({ ...prev, fee_item_id: e.target.value }))}
            >
              <option value="">— select radiology type —</option>
              {catalog.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.label} · {money(row.unit_price)}
                </option>
              ))}
            </select>
            {catalog.length === 0 && (
              <p className="mt-1 text-xs text-muted">
                No imaging procedures yet. Ask an admin to add them under Clinic admin → Procedures
                (category: imaging).
              </p>
            )}
          </div>
          <div>
            <label className="label" htmlFor="radiology-region">
              Region
            </label>
            <input
              id="radiology-region"
              className="input"
              value={draft.region}
              onChange={(e) => setDraft((prev) => ({ ...prev, region: e.target.value }))}
              placeholder="e.g. tooth 36"
            />
          </div>
          <div>
            <label className="label" htmlFor="radiology-qty">
              Quantity
            </label>
            <input
              id="radiology-qty"
              className="input"
              type="number"
              min={1}
              max={20}
              value={draft.quantity}
              onChange={(e) =>
                setDraft((prev) => ({ ...prev, quantity: Math.max(1, Number(e.target.value) || 1) }))
              }
            />
          </div>
          <div className="sm:col-span-2">
            <label className="label" htmlFor="radiology-comment">
              Comment
            </label>
            <textarea
              id="radiology-comment"
              className="input"
              rows={2}
              value={draft.comment}
              onChange={(e) => setDraft((prev) => ({ ...prev, comment: e.target.value }))}
              placeholder="Indication or findings…"
            />
          </div>
          <div className="sm:col-span-2">
            <span className="label">Image</span>
            <div
              className="ix-drop"
              tabIndex={0}
              onPaste={(e) => {
                const file = fileFromClipboard(e);
                if (file) {
                  e.preventDefault();
                  attachFile(file);
                }
              }}
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = "copy";
              }}
              onDrop={(e) => {
                e.preventDefault();
                attachFile(fileFromDrop(e));
              }}
            >
              {draft.previewUrl ? (
                <img src={draft.previewUrl} alt="Radiology preview" className="ix-drop__preview" />
              ) : (
                <p className="text-sm text-muted">Upload a file or paste an image (Ctrl+V)</p>
              )}
              <div className="flex flex-wrap gap-2">
                <input
                  ref={fileRef}
                  className="input"
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/*,.dcm,application/dicom"
                  onChange={(e) => {
                    attachFile(e.target.files?.[0] || null);
                    e.target.value = "";
                  }}
                />
                {draft.file && (
                  <button type="button" className="btn-ghost text-xs" onClick={() => attachFile(null)}>
                    Remove image
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {queued.length > 0 && (
          <ul className="space-y-1.5">
            {queued.map((row) => (
              <li key={row.localId} className="ix-overview">
                <span className="min-w-0 flex-1">{row.overview}</span>
                <button
                  type="button"
                  className="btn-ghost text-xs"
                  onClick={() => removeQueued(row.localId)}
                  disabled={busy}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-ghost" onClick={addRow} disabled={busy}>
            Add
          </button>
          <button type="button" className="btn-ghost" onClick={addAnother} disabled={busy}>
            Add another
          </button>
          <button type="button" className="btn-primary" onClick={() => void saveAll()} disabled={busy}>
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
