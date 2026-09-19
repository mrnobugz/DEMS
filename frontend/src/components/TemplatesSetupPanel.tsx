import { FormEvent, useEffect, useMemo, useState } from "react";
import { ConfigField, ConfigStatus, ConfirmAction } from "@/components/config/ConfigUi";
import { api, ApiError } from "@/lib/api";
import type { SystemSetting } from "@/components/OrganizationPanel";

type Template = {
  id: string;
  kind: string;
  key: string;
  name: string;
  subject?: string | null;
  body: string;
  is_active: boolean;
};

type ApprovalChain = {
  id: string;
  name: string;
  category?: string | null;
  min_amount: number;
  steps: { order?: number; role?: string; label?: string }[];
  is_active: boolean;
};

type ImportResult = {
  kind: string;
  dry_run: boolean;
  created: number;
  updated: number;
  errors: string[];
  row_count: number;
};

const FLAG_KEYS = [
  { key: "feature.requisition", label: "Requisition" },
  { key: "feature.analytics_phi_drilldown", label: "Analytics PHI drill-down" },
  { key: "feature.dicom", label: "DICOM imaging" },
  { key: "feature.patient_portal", label: "Patient portal" },
  { key: "notify.sms_enabled", label: "SMS notifications" },
  { key: "notify.email_enabled", label: "Email notifications" },
];

export function TemplatesSetupPanel() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [settings, setSettings] = useState<SystemSetting[]>([]);
  const [chains, setChains] = useState<ApprovalChain[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [editing, setEditing] = useState<Template | null>(null);
  const [chainForm, setChainForm] = useState({ name: "", min_amount: "0", category: "purchase" });
  const [csvKind, setCsvKind] = useState("procedures");
  const [csvText, setCsvText] = useState("code,label,category,unit_price\nexam,Examination,diagnostic,25000");

  async function load() {
    const [t, s, c] = await Promise.all([
      api<Template[]>("/api/v1/config/templates?include_inactive=true"),
      api<SystemSetting[]>("/api/v1/config/settings"),
      api<ApprovalChain[]>("/api/v1/config/approval-chains?include_inactive=true"),
    ]);
    setTemplates(t);
    setSettings(s);
    setChains(c);
  }

  useEffect(() => {
    setLoading(true);
    load()
      .catch((err) => setError(err instanceof ApiError ? err.message : "Could not load templates"))
      .finally(() => setLoading(false));
  }, []);

  const flags = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of settings) {
      if (row.scope === "clinic") map.set(row.key, row.value);
    }
    return map;
  }, [settings]);

  async function saveFlag(key: string, on: boolean) {
    setError("");
    try {
      await api("/api/v1/config/settings", {
        method: "PUT",
        body: JSON.stringify({ key, value: on ? "true" : "false", scope: "clinic" }),
      });
      await load();
      setOk(`${on ? "Enabled" : "Disabled"} ${FLAG_KEYS.find((f) => f.key === key)?.label ?? key}`);
    } catch (err) {
      setOk("");
      setError(err instanceof ApiError ? err.message : "Could not save flag");
    }
  }

  async function saveTemplate(e: FormEvent) {
    e.preventDefault();
    if (!editing) return;
    setError("");
    try {
      const qs = editing.id ? `?template_id=${editing.id}` : "";
      await api(`/api/v1/config/templates${qs}`, {
        method: "PUT",
        body: JSON.stringify({
          kind: editing.kind,
          key: editing.key,
          name: editing.name,
          subject: editing.subject,
          body: editing.body,
          is_active: editing.is_active,
        }),
      });
      setEditing(null);
      await load();
      setOk("Template saved");
    } catch (err) {
      setOk("");
      setError(err instanceof ApiError ? err.message : "Could not save template");
    }
  }

  async function addChain(e: FormEvent) {
    e.preventDefault();
    setError("");
    try {
      await api("/api/v1/config/approval-chains", {
        method: "PUT",
        body: JSON.stringify({
          name: chainForm.name,
          category: chainForm.category,
          min_amount: Number(chainForm.min_amount) || 0,
          steps: [
            { order: 1, role: "clinic_admin", label: "Clinic admin" },
            { order: 2, role: "accountant", label: "Finance" },
          ],
        }),
      });
      setChainForm({ name: "", min_amount: "0", category: "purchase" });
      await load();
      setOk("Approval chain added");
    } catch (err) {
      setOk("");
      setError(err instanceof ApiError ? err.message : "Could not save chain");
    }
  }

  async function runImport(dryRun: boolean) {
    setError("");
    setOk("");
    try {
      const result = await api<ImportResult>("/api/v1/config/import", {
        method: "POST",
        body: JSON.stringify({ kind: csvKind, csv_text: csvText, dry_run: dryRun }),
      });
      setOk(
        `${dryRun ? "Dry run" : "Imported"} ${result.row_count} rows · ${result.created} new · ${result.updated} updated` +
          (result.errors.length ? ` · ${result.errors.length} errors` : ""),
      );
      if (result.errors.length) setError(result.errors.slice(0, 5).join("; "));
      if (!dryRun) await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Import failed");
    }
  }

  return (
    <div className="space-y-3">
      <ConfigStatus loading={loading} error={error} ok={ok} />

      <section className="glass-panel space-y-3">
        <h3 className="font-display text-base font-bold text-brand-900">Feature flags</h3>
        <ul className="admin-list">
          {FLAG_KEYS.map((flag) => {
            const on = (flags.get(flag.key) || "false").toLowerCase() === "true";
            return (
              <li key={flag.key}>
                <div>
                  <div className="font-semibold">{flag.label}</div>
                  <div className="text-xs text-muted">{flag.key}</div>
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={on}
                    aria-label={flag.label}
                    onChange={(e) => void saveFlag(flag.key, e.target.checked)}
                  />
                  {on ? "On" : "Off"}
                </label>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="glass-panel space-y-3">
        <div>
          <h3 className="font-display text-base font-bold text-brand-900">Templates</h3>
          <p className="text-sm text-muted">
            SOAP, consent, Rx, letters, and appointment reminders. Placeholders like {"{{patient_name}}"} stay as text.
          </p>
        </div>
        {templates.length === 0 && !loading ? (
          <p className="text-sm text-muted">No templates yet.</p>
        ) : (
          <ul className="admin-list">
            {templates.map((t) => (
              <li key={t.id}>
                <div>
                  <div className="font-semibold">{t.name}</div>
                  <div className="text-xs text-muted">
                    {t.kind} · {t.key}
                  </div>
                </div>
                <button type="button" className="btn-ghost text-sm" onClick={() => setEditing(t)}>
                  Edit
                </button>
              </li>
            ))}
          </ul>
        )}
        {editing && (
          <form className="config-form-stack border-t border-brand-100 pt-3" onSubmit={saveTemplate}>
            <ConfigField label="Name">
              <input
                className="input"
                value={editing.name}
                onChange={(e) => setEditing({ ...editing, name: e.target.value })}
              />
            </ConfigField>
            <ConfigField label="Subject">
              <input
                className="input"
                value={editing.subject || ""}
                onChange={(e) => setEditing({ ...editing, subject: e.target.value })}
              />
            </ConfigField>
            <ConfigField label="Body">
              <textarea
                className="input min-h-32"
                value={editing.body}
                onChange={(e) => setEditing({ ...editing, body: e.target.value })}
              />
            </ConfigField>
            <div className="flex gap-2">
              <button type="submit" className="btn-primary">
                Save template
              </button>
              <button type="button" className="btn-ghost" onClick={() => setEditing(null)}>
                Cancel
              </button>
            </div>
          </form>
        )}
      </section>

      <section className="glass-panel space-y-3">
        <h3 className="font-display text-base font-bold text-brand-900">Requisition approval chains</h3>
        <form className="config-form-row" onSubmit={addChain}>
          <ConfigField label="Name">
            <input
              className="input"
              value={chainForm.name}
              onChange={(e) => setChainForm({ ...chainForm, name: e.target.value })}
              required
            />
          </ConfigField>
          <ConfigField label="Minimum amount">
            <input
              className="input w-32"
              type="number"
              min={0}
              value={chainForm.min_amount}
              onChange={(e) => setChainForm({ ...chainForm, min_amount: e.target.value })}
            />
          </ConfigField>
          <button type="submit" className="btn-primary">
            Add chain
          </button>
        </form>
        {chains.length === 0 && !loading ? (
          <p className="text-sm text-muted">No approval chains yet. Add a name and minimum amount above.</p>
        ) : (
          <ul className="admin-list">
            {chains.map((c) => (
              <li key={c.id}>
                <div>
                  <div className="font-semibold">{c.name}</div>
                  <div className="text-xs text-muted">
                    From {c.min_amount.toLocaleString()} · {(c.steps || []).map((s) => s.label || s.role).join(" → ") || "one step"}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="glass-panel space-y-3">
        <div>
          <h3 className="font-display text-base font-bold text-brand-900">CSV import</h3>
          <p className="text-sm text-muted">
            Run a dry run first. Procedures need code,label[,category,unit_price]. Catalog lists need code,label.
          </p>
        </div>
        <ConfigField label="Import type">
          <select className="input max-w-xs" value={csvKind} onChange={(e) => setCsvKind(e.target.value)}>
            <option value="procedures">Procedures</option>
            <option value="diagnosis">Diagnoses</option>
            <option value="allergy">Allergies</option>
            <option value="medical_alert">Medical alerts</option>
            <option value="medication">Formulary</option>
          </select>
        </ConfigField>
        <ConfigField label="CSV">
          <textarea
            className="input min-h-32 font-mono text-sm"
            value={csvText}
            onChange={(e) => setCsvText(e.target.value)}
            spellCheck={false}
          />
        </ConfigField>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-ghost" onClick={() => void runImport(true)}>
            Dry run
          </button>
          <ConfirmAction label="Import" confirmLabel="Yes, import" onConfirm={() => runImport(false)} />
        </div>
      </section>
    </div>
  );
}
