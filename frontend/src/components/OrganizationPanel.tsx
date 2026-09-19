import { FormEvent, useEffect, useMemo, useState } from "react";
import { ConfigField, ConfigStatus, ConfirmAction } from "@/components/config/ConfigUi";
import { api, ApiError } from "@/lib/api";

export type OrgDepartment = {
  id: string;
  code: string;
  name: string;
  head_user_id?: string | null;
  sort_order: number;
  is_active: boolean;
};

export type Operatory = {
  id: string;
  department_id?: string | null;
  code: string;
  name: string;
  chair_number?: number | null;
  sort_order: number;
  is_active: boolean;
};

export type WorkingHours = {
  id: string;
  day_of_week: number;
  starts_on: string;
  ends_on: string;
  owner_type: string;
};

export type Holiday = {
  id: string;
  holiday_date: string;
  name: string;
  is_active: boolean;
};

export type SystemSetting = {
  id: string;
  key: string;
  value: string;
  scope: string;
};

export type NumberSequence = {
  id: string;
  document_type: string;
  prefix: string;
  padding: number;
  next_value: number;
  year_reset: boolean;
  current_year: number;
};

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

type HoursDraft = { day_of_week: number; starts_on: string; ends_on: string; enabled: boolean };

function hoursFromRows(rows: WorkingHours[]): HoursDraft[] {
  return DAYS.map((_, i) => {
    const row = rows.find((r) => r.day_of_week === i && r.owner_type === "clinic");
    return {
      day_of_week: i,
      starts_on: row?.starts_on ?? "08:00",
      ends_on: row?.ends_on ?? (i === 5 ? "13:00" : "17:00"),
      enabled: Boolean(row),
    };
  });
}

export function OrganizationPanel() {
  const [departments, setDepartments] = useState<OrgDepartment[]>([]);
  const [operatories, setOperatories] = useState<Operatory[]>([]);
  const [hours, setHours] = useState<HoursDraft[]>(hoursFromRows([]));
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [settings, setSettings] = useState<SystemSetting[]>([]);
  const [sequences, setSequences] = useState<NumberSequence[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [deptForm, setDeptForm] = useState({ code: "", name: "" });
  const [opForm, setOpForm] = useState({ code: "", name: "", department_id: "", chair_number: "" });
  const [holidayForm, setHolidayForm] = useState({ holiday_date: "", name: "" });

  const notation = useMemo(
    () => settings.find((s) => s.key === "clinical.tooth_notation" && s.scope === "clinic")?.value ?? "fdi",
    [settings],
  );

  async function load() {
    const [d, o, h, hol, s, seq] = await Promise.all([
      api<OrgDepartment[]>("/api/v1/config/departments?include_inactive=true"),
      api<Operatory[]>("/api/v1/config/operatories?include_inactive=true"),
      api<WorkingHours[]>("/api/v1/config/hours"),
      api<Holiday[]>("/api/v1/config/holidays"),
      api<SystemSetting[]>("/api/v1/config/settings"),
      api<NumberSequence[]>("/api/v1/config/sequences"),
    ]);
    setDepartments(d);
    setOperatories(o);
    setHours(hoursFromRows(h));
    setHolidays(hol);
    setSettings(s);
    setSequences(seq);
  }

  useEffect(() => {
    setLoading(true);
    load()
      .catch((err) => setError(err instanceof ApiError ? err.message : "Could not load organization"))
      .finally(() => setLoading(false));
  }, []);

  function fail(err: unknown) {
    setOk("");
    setError(err instanceof ApiError ? err.message : "Save failed");
  }

  async function succeed(message: string) {
    setError("");
    await load();
    setOk(message);
  }

  async function addDepartment(e: FormEvent) {
    e.preventDefault();
    setError("");
    try {
      await api("/api/v1/config/departments", {
        method: "POST",
        body: JSON.stringify(deptForm),
      });
      setDeptForm({ code: "", name: "" });
      await succeed("Department added");
    } catch (err) {
      fail(err);
    }
  }

  async function toggleDepartment(row: OrgDepartment) {
    setError("");
    try {
      await api(`/api/v1/config/departments/${row.id}`, {
        method: "PATCH",
        body: JSON.stringify({ is_active: !row.is_active }),
      });
      await succeed(row.is_active ? `${row.name} deactivated` : `${row.name} reactivated`);
    } catch (err) {
      fail(err);
    }
  }

  async function addOperatory(e: FormEvent) {
    e.preventDefault();
    setError("");
    try {
      await api("/api/v1/config/operatories", {
        method: "POST",
        body: JSON.stringify({
          code: opForm.code,
          name: opForm.name,
          department_id: opForm.department_id || null,
          chair_number: opForm.chair_number ? Number(opForm.chair_number) : null,
        }),
      });
      setOpForm({ code: "", name: "", department_id: "", chair_number: "" });
      await succeed("Chair added");
    } catch (err) {
      fail(err);
    }
  }

  async function toggleOperatory(row: Operatory) {
    setError("");
    try {
      await api(`/api/v1/config/operatories/${row.id}`, {
        method: "PATCH",
        body: JSON.stringify({ is_active: !row.is_active }),
      });
      await succeed(row.is_active ? `${row.name} deactivated` : `${row.name} reactivated`);
    } catch (err) {
      fail(err);
    }
  }

  async function saveHours(e: FormEvent) {
    e.preventDefault();
    setError("");
    try {
      await api("/api/v1/config/hours", {
        method: "PUT",
        body: JSON.stringify({
          days: hours
            .filter((d) => d.enabled)
            .map((d) => ({ day_of_week: d.day_of_week, starts_on: d.starts_on, ends_on: d.ends_on })),
        }),
      });
      await succeed("Working hours saved");
    } catch (err) {
      fail(err);
    }
  }

  async function addHoliday(e: FormEvent) {
    e.preventDefault();
    setError("");
    try {
      await api("/api/v1/config/holidays", {
        method: "POST",
        body: JSON.stringify(holidayForm),
      });
      setHolidayForm({ holiday_date: "", name: "" });
      await succeed("Holiday added");
    } catch (err) {
      fail(err);
    }
  }

  async function removeHoliday(id: string) {
    setError("");
    try {
      await api(`/api/v1/config/holidays/${id}`, { method: "DELETE" });
      await succeed("Holiday deactivated");
    } catch (err) {
      fail(err);
    }
  }

  async function saveNotation(value: string) {
    setError("");
    try {
      await api("/api/v1/config/settings", {
        method: "PUT",
        body: JSON.stringify({ key: "clinical.tooth_notation", value, scope: "clinic" }),
      });
      await succeed("Tooth numbering saved");
    } catch (err) {
      fail(err);
    }
  }

  async function saveSequence(row: NumberSequence, patch: Partial<NumberSequence>) {
    setError("");
    try {
      await api(`/api/v1/config/sequences/${row.id}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      });
      await succeed(`${row.document_type.replaceAll("_", " ")} sequence saved`);
    } catch (err) {
      fail(err);
    }
  }

  const activeDepts = departments.filter((d) => d.is_active);

  return (
    <div className="space-y-3">
      <ConfigStatus loading={loading} error={error} ok={ok} />

      <section className="glass-panel space-y-3">
        <div>
          <h3 className="font-display text-base font-bold text-brand-900">Clinic settings</h3>
          <p className="text-sm text-muted">Clinic overrides the platform default. Charting reads tooth numbering from here.</p>
        </div>
        <ConfigField label="Tooth numbering">
          <select className="input max-w-xs" value={notation} onChange={(e) => void saveNotation(e.target.value)}>
            <option value="fdi">FDI</option>
            <option value="universal">Universal</option>
            <option value="palmer">Palmer</option>
          </select>
        </ConfigField>
      </section>

      <div className="grid gap-3 lg:grid-cols-2">
        <section className="glass-panel space-y-3">
          <h3 className="font-display text-base font-bold text-brand-900">Departments</h3>
          <form className="config-form-row" onSubmit={addDepartment}>
            <ConfigField label="Code">
              <input
                className="input"
                value={deptForm.code}
                onChange={(e) => setDeptForm({ ...deptForm, code: e.target.value })}
                required
              />
            </ConfigField>
            <ConfigField label="Name">
              <input
                className="input"
                value={deptForm.name}
                onChange={(e) => setDeptForm({ ...deptForm, name: e.target.value })}
                required
              />
            </ConfigField>
            <button type="submit" className="btn-primary">
              Add
            </button>
          </form>
          {departments.length === 0 && !loading ? (
            <p className="text-sm text-muted">No departments yet. Add a code and name above.</p>
          ) : (
            <ul className="admin-list">
              {departments.map((d) => (
                <li key={d.id}>
                  <div>
                    <div className="font-semibold">{d.name}</div>
                    <div className="text-xs text-muted">
                      {d.code}
                      {!d.is_active ? " · inactive" : ""}
                    </div>
                  </div>
                  {d.is_active ? (
                    <ConfirmAction
                      label="Deactivate"
                      confirmLabel="Yes, deactivate"
                      onConfirm={() => toggleDepartment(d)}
                    />
                  ) : (
                    <button type="button" className="btn-ghost text-sm" onClick={() => void toggleDepartment(d)}>
                      Reactivate
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="glass-panel space-y-3">
          <h3 className="font-display text-base font-bold text-brand-900">Operatories / chairs</h3>
          <form className="grid grid-cols-2 gap-2" onSubmit={addOperatory}>
            <ConfigField label="Code">
              <input
                className="input"
                value={opForm.code}
                onChange={(e) => setOpForm({ ...opForm, code: e.target.value })}
                required
              />
            </ConfigField>
            <ConfigField label="Name">
              <input
                className="input"
                value={opForm.name}
                onChange={(e) => setOpForm({ ...opForm, name: e.target.value })}
                required
              />
            </ConfigField>
            <ConfigField label="Department">
              <select
                className="input"
                value={opForm.department_id}
                onChange={(e) => setOpForm({ ...opForm, department_id: e.target.value })}
              >
                <option value="">None</option>
                {activeDepts.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </ConfigField>
            <ConfigField label="Chair number">
              <input
                className="input"
                type="number"
                min={1}
                value={opForm.chair_number}
                onChange={(e) => setOpForm({ ...opForm, chair_number: e.target.value })}
              />
            </ConfigField>
            <button type="submit" className="btn-primary col-span-2">
              Add chair
            </button>
          </form>
          {operatories.length === 0 && !loading ? (
            <p className="text-sm text-muted">No chairs yet. Add a code and name above.</p>
          ) : (
            <ul className="admin-list">
              {operatories.map((o) => (
                <li key={o.id}>
                  <div>
                    <div className="font-semibold">{o.name}</div>
                    <div className="text-xs text-muted">
                      {o.code}
                      {o.chair_number ? ` · chair ${o.chair_number}` : ""}
                      {!o.is_active ? " · inactive" : ""}
                    </div>
                  </div>
                  {o.is_active ? (
                    <ConfirmAction
                      label="Deactivate"
                      confirmLabel="Yes, deactivate"
                      onConfirm={() => toggleOperatory(o)}
                    />
                  ) : (
                    <button type="button" className="btn-ghost text-sm" onClick={() => void toggleOperatory(o)}>
                      Reactivate
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="glass-panel space-y-3">
        <h3 className="font-display text-base font-bold text-brand-900">Working hours</h3>
        <form className="space-y-2" onSubmit={saveHours}>
          {hours.map((row) => (
            <div key={row.day_of_week} className="flex flex-wrap items-center gap-2">
              <label className="flex w-24 items-center gap-2 text-sm font-semibold">
                <input
                  type="checkbox"
                  checked={row.enabled}
                  onChange={(e) =>
                    setHours((all) => all.map((d) => (d.day_of_week === row.day_of_week ? { ...d, enabled: e.target.checked } : d)))
                  }
                />
                {DAYS[row.day_of_week]}
              </label>
              <ConfigField label="Opens">
                <input
                  className="input w-28"
                  type="time"
                  aria-label={`${DAYS[row.day_of_week]} opens`}
                  value={row.starts_on}
                  disabled={!row.enabled}
                  onChange={(e) =>
                    setHours((all) => all.map((d) => (d.day_of_week === row.day_of_week ? { ...d, starts_on: e.target.value } : d)))
                  }
                />
              </ConfigField>
              <ConfigField label="Closes">
                <input
                  className="input w-28"
                  type="time"
                  aria-label={`${DAYS[row.day_of_week]} closes`}
                  value={row.ends_on}
                  disabled={!row.enabled}
                  onChange={(e) =>
                    setHours((all) => all.map((d) => (d.day_of_week === row.day_of_week ? { ...d, ends_on: e.target.value } : d)))
                  }
                />
              </ConfigField>
            </div>
          ))}
          <button type="submit" className="btn-primary">
            Save hours
          </button>
        </form>
      </section>

      <div className="grid gap-3 lg:grid-cols-2">
        <section className="glass-panel space-y-3">
          <h3 className="font-display text-base font-bold text-brand-900">Holidays</h3>
          <form className="config-form-row" onSubmit={addHoliday}>
            <ConfigField label="Date">
              <input
                className="input"
                type="date"
                value={holidayForm.holiday_date}
                onChange={(e) => setHolidayForm({ ...holidayForm, holiday_date: e.target.value })}
                required
              />
            </ConfigField>
            <ConfigField label="Name">
              <input
                className="input"
                value={holidayForm.name}
                onChange={(e) => setHolidayForm({ ...holidayForm, name: e.target.value })}
                required
              />
            </ConfigField>
            <button type="submit" className="btn-primary">
              Add
            </button>
          </form>
          {holidays.length === 0 && !loading ? (
            <p className="text-sm text-muted">No holidays yet. Add a closed date above.</p>
          ) : (
            <ul className="admin-list">
              {holidays.map((h) => (
                <li key={h.id}>
                  <div>
                    <div className="font-semibold">{h.name}</div>
                    <div className="text-xs text-muted">{h.holiday_date}</div>
                  </div>
                  <ConfirmAction
                    label="Deactivate"
                    confirmLabel="Yes, deactivate"
                    onConfirm={() => removeHoliday(h.id)}
                  />
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="glass-panel space-y-3">
          <h3 className="font-display text-base font-bold text-brand-900">Number sequences</h3>
          {sequences.length === 0 && !loading ? (
            <p className="text-sm text-muted">No document sequences configured yet.</p>
          ) : (
            <ul className="admin-list">
              {sequences.map((s) => (
                <li key={s.id} className="!items-start">
                  <div className="w-full space-y-1">
                    <div className="font-semibold capitalize">{s.document_type.replaceAll("_", " ")}</div>
                    <div className="config-form-row">
                      <ConfigField label="Prefix">
                        <input
                          className="input w-24"
                          defaultValue={s.prefix}
                          aria-label={`${s.document_type} prefix`}
                          onBlur={(e) => {
                            if (e.target.value !== s.prefix) void saveSequence(s, { prefix: e.target.value });
                          }}
                        />
                      </ConfigField>
                      <ConfigField label="Next number">
                        <input
                          className="input w-24"
                          type="number"
                          min={1}
                          defaultValue={s.next_value}
                          aria-label={`${s.document_type} next number`}
                          onBlur={(e) => {
                            const n = Number(e.target.value);
                            if (n !== s.next_value) void saveSequence(s, { next_value: n });
                          }}
                        />
                      </ConfigField>
                    </div>
                    <p className="text-xs text-muted">
                      Leave a field to save. Padding {s.padding}
                      {s.year_reset ? " · resets each year" : ""}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
