/**
 * Table export helpers: CSV download and a printable sheet (Print → Save as PDF).
 * Printing reuses the hidden-iframe printer from printRegistration so there is
 * one print mechanism in the app and no PDF dependency to ship.
 */

import { printHtmlDocument } from "@/lib/printRegistration";

export type ExportColumn<T> = {
  key: string;
  header: string;
  value: (row: T) => string | number | null | undefined;
  /** Right-align numeric columns on the printed sheet. */
  numeric?: boolean;
};

function csvCell(value: string | number | null | undefined) {
  if (value === null || value === undefined) return "";
  const text = String(value);
  // Guard against spreadsheet formula injection from free-text clinical fields.
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return /[",\n\r]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

export function toCsv<T>(rows: T[], columns: ExportColumn<T>[]): string {
  const head = columns.map((col) => csvCell(col.header)).join(",");
  const body = rows.map((row) => columns.map((col) => csvCell(col.value(row))).join(","));
  // BOM so Excel opens UTF-8 names correctly.
  return `\uFEFF${[head, ...body].join("\r\n")}\r\n`;
}

export function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function exportRowsToCsv<T>(
  filename: string,
  rows: T[],
  columns: ExportColumn<T>[],
) {
  downloadCsv(filename, toCsv(rows, columns));
}

function esc(value: string | number | null | undefined) {
  return String(value ?? "").replace(
    /[&<>"]/g,
    (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[char] || char,
  );
}

const SHEET_CSS = `
  @page { size: A4 landscape; margin: 12mm; }
  * { box-sizing: border-box; }
  body { font-family: "Segoe UI", Arial, sans-serif; color: #0f172a; margin: 0; }
  h1 { font-size: 15pt; margin: 0 0 2mm; }
  .meta { font-size: 8.5pt; color: #55617a; margin-bottom: 4mm; }
  .meta span + span::before { content: " · "; }
  table { width: 100%; border-collapse: collapse; font-size: 8.5pt; }
  thead { display: table-header-group; }
  th, td { border: 1px solid #c9d4e8; padding: 1.6mm 2mm; text-align: left; vertical-align: top; }
  th { background: #eef4ff; font-size: 8pt; text-transform: uppercase; letter-spacing: 0.03em; }
  tr { page-break-inside: avoid; }
  td.num, th.num { text-align: right; }
  tbody tr:nth-child(even) td { background: #f7faff; }
  footer { margin-top: 4mm; font-size: 8pt; color: #55617a; }
`;

/** Opens the browser print dialog on a paginated A4 sheet; the user saves it as PDF. */
export function printTableSheet<T>({
  title,
  meta,
  rows,
  columns,
  footNote,
}: {
  title: string;
  meta?: string[];
  rows: T[];
  columns: ExportColumn<T>[];
  footNote?: string;
}) {
  const head = columns
    .map((col) => `<th class="${col.numeric ? "num" : ""}">${esc(col.header)}</th>`)
    .join("");
  const body = rows
    .map(
      (row) =>
        `<tr>${columns
          .map((col) => `<td class="${col.numeric ? "num" : ""}">${esc(col.value(row))}</td>`)
          .join("")}</tr>`,
    )
    .join("");
  const metaLine = (meta || []).map((item) => `<span>${esc(item)}</span>`).join("");
  printHtmlDocument(
    `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title>
      <style>${SHEET_CSS}</style></head>
      <body>
        <h1>${esc(title)}</h1>
        <div class="meta">${metaLine}</div>
        <table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>
        ${footNote ? `<footer>${esc(footNote)}</footer>` : ""}
      </body></html>`,
  );
}

/** Printable sheet for one record, rendered as labelled sections instead of a grid. */
export function printRecordSheet({
  title,
  meta,
  sections,
  footNote,
}: {
  title: string;
  meta?: string[];
  sections: Array<{ heading: string; rows: Array<[string, string]>; body?: string }>;
  footNote?: string;
}) {
  const metaLine = (meta || []).map((item) => `<span>${esc(item)}</span>`).join("");
  const blocks = sections
    .map(
      (section) => `<section>
        <h2>${esc(section.heading)}</h2>
        ${
          section.rows.length
            ? `<dl>${section.rows
                .map(([label, value]) => `<dt>${esc(label)}</dt><dd>${esc(value)}</dd>`)
                .join("")}</dl>`
            : ""
        }
        ${section.body ? `<p>${esc(section.body)}</p>` : ""}
      </section>`,
    )
    .join("");
  printHtmlDocument(
    `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title>
      <style>
        @page { size: A4 portrait; margin: 14mm; }
        body { font-family: "Segoe UI", Arial, sans-serif; color: #0f172a; margin: 0; font-size: 10pt; }
        h1 { font-size: 16pt; margin: 0 0 2mm; }
        h2 { font-size: 10.5pt; margin: 0 0 1.5mm; color: #14417a; }
        .meta { font-size: 9pt; color: #55617a; margin-bottom: 5mm; }
        .meta span + span::before { content: " · "; }
        section { break-inside: avoid; border: 1px solid #c9d4e8; border-radius: 3mm; padding: 3mm 3.5mm; margin-bottom: 3mm; }
        dl { display: grid; grid-template-columns: 38mm 1fr; gap: 1mm 3mm; margin: 0; }
        dt { color: #55617a; }
        dd { margin: 0; font-weight: 600; }
        p { margin: 1.5mm 0 0; white-space: pre-wrap; }
        footer { font-size: 8.5pt; color: #55617a; }
      </style></head>
      <body>
        <h1>${esc(title)}</h1>
        <div class="meta">${metaLine}</div>
        ${blocks}
        ${footNote ? `<footer>${esc(footNote)}</footer>` : ""}
      </body></html>`,
  );
}
