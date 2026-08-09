import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { Icd10Code, Icd10CodeRef } from "@/lib/types";

type Props = {
  label?: string;
  selected: Icd10CodeRef[];
  onChange: (codes: Icd10CodeRef[]) => void;
  multiple?: boolean;
  placeholder?: string;
};

export function Icd10Picker({
  label = "ICD-10 (K00–K14)",
  selected,
  onChange,
  multiple = true,
  placeholder = "Search caries, pulpitis, gingivitis, K02…",
}: Props) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Icd10Code[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!q.trim()) {
      setHits([]);
      return;
    }
    const t = window.setTimeout(() => {
      void api<Icd10Code[]>(
        `/api/v1/clinical/icd10?limit=25&q=${encodeURIComponent(q.trim())}`,
      ).then(setHits);
    }, 200);
    return () => window.clearTimeout(t);
  }, [q]);

  function add(code: Icd10Code) {
    if (multiple) {
      if (selected.some((s) => s.code === code.code)) return;
      onChange([...selected, { code: code.code, description: code.description }]);
    } else {
      onChange([{ code: code.code, description: code.description }]);
    }
    setQ("");
    setHits([]);
    setOpen(false);
  }

  function remove(code: string) {
    onChange(selected.filter((s) => s.code !== code));
  }

  return (
    <div className="relative space-y-2">
      <label className="label">{label}</label>
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {selected.map((s) => (
            <span
              key={s.code}
              className="inline-flex max-w-full items-center gap-1 rounded-full bg-brand-50 px-2.5 py-1 text-xs text-brand-900"
            >
              <span className="font-mono font-bold">{s.code}</span>
              <span className="truncate">{s.description}</span>
              <button
                type="button"
                className="ml-1 text-brand-600 hover:text-red-600"
                onClick={() => remove(s.code)}
                aria-label={`Remove ${s.code}`}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      <input
        className="input"
        placeholder={placeholder}
        value={q}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
      />
      {open && hits.length > 0 && (
        <ul className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-xl border border-brand-100 bg-white shadow-lg">
          {hits.map((h) => (
            <li key={h.code}>
              <button
                type="button"
                className="flex w-full flex-col gap-0.5 px-3 py-2 text-left text-sm hover:bg-brand-50"
                onClick={() => add(h)}
              >
                <span className="font-mono text-xs font-bold text-brand-700">
                  {h.code}
                  {!h.billable && (
                    <span className="ml-2 rounded bg-amber-50 px-1 text-[10px] font-semibold text-amber-700">
                      category
                    </span>
                  )}
                </span>
                <span className="text-brand-900">{h.description}</span>
                <span className="text-[10px] text-muted">{h.category_label}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="text-[11px] text-muted">
        Dental ICD-10-CM block K00–K14 · oral cavity & salivary glands
      </p>
    </div>
  );
}
