import { barcodeSvg } from "@/lib/barcode128";

export type PrintableRegistration = {
  clinicName?: string;
  patientCode: string;
  patientName: string;
  dateOfBirth?: string | null;
  sex?: string | null;
  phone?: string | null;
  nationalId?: string | null;
  hospitalReg?: string | null;
  photoDataUrl?: string | null;
  queueNumber?: number | null;
  serviceName?: string | null;
  department?: string | null;
  staffName?: string | null;
  startsAt?: string | null;
  isAppointment?: boolean;
};

export type RegistrationPrintKind = "ticket" | "card" | "pack";

const DEPT_LABEL: Record<string, string> = {
  restorative: "Restorative",
  maxillofacial: "Maxillofacial",
  orthodontic: "Orthodontic",
  paediatric: "Paediatric",
};

const PRINT_FRAME_ID = "demsta-registration-print";

function esc(value?: string | null) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function deptLabel(id?: string | null) {
  if (!id) return "—";
  return DEPT_LABEL[id] || id;
}

function timeLabel(iso?: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
}

function portraitSrc(url?: string | null) {
  if (!url) return "";
  return /^(data:image\/|blob:|https?:)/i.test(url) ? url : "";
}

function pageRule(kind: RegistrationPrintKind) {
  if (kind === "card") return "@page { size: 85.6mm 54mm; margin: 3mm; }";
  if (kind === "ticket") return "@page { size: 80mm 140mm; margin: 4mm; }";
  return "@page { size: A5 portrait; margin: 8mm; }";
}

const SHEET_CSS = `
  html, body { margin: 0; padding: 0; background: #fff; }
  body { font-family: "Segoe UI", Georgia, sans-serif; color: #041e5c; }
  h1, h2, p { margin: 0; }
  .sheet { display: flex; flex-direction: column; gap: 12px; align-items: center; padding: 8px; }
  .ticket { width: 80mm; box-sizing: border-box; border: 1px dashed #0b5fff; padding: 10px 10px 8px; background: #fff; }
  .ticket-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; }
  .brand { font-size: 11px; letter-spacing: .14em; text-transform: uppercase; font-weight: 800; }
  .muted { color: #5a6b85; font-size: 10px; }
  .q { font-size: 44px; font-weight: 800; line-height: .9; font-family: ui-monospace, Consolas, monospace; margin: 6px 0 4px; }
  .name { font-size: 15px; font-weight: 700; }
  .row { font-size: 11px; margin-top: 2px; }
  .ticket-id { display: flex; gap: 8px; align-items: flex-end; margin-top: 8px; }
  .ticket-id .mini { width: 18mm; height: 22mm; object-fit: cover; border: 1px solid #041e5c; background: #e0edff; }
  .ticket-id .barcode { flex: 1; }
  .card { width: 85.6mm; height: 54mm; box-sizing: border-box; border: 1.6px solid #041e5c; border-radius: 6px; padding: 6px 7px 5px; display: flex; flex-direction: column; justify-content: space-between; overflow: hidden; background: linear-gradient(180deg, #f4f8ff 0%, #fff 38%); }
  .card-top { display: flex; gap: 7px; min-height: 0; }
  .portrait { width: 20mm; height: 26mm; object-fit: cover; border: 1px solid #041e5c; background: #dbe7ff; flex: none; }
  .ph { width: 20mm; height: 26mm; display: flex; align-items: center; justify-content: center; font-size: 9px; font-weight: 800; letter-spacing: .08em; color: #5a6b85; border: 1px dashed #7eb6ff; background: #eef4ff; flex: none; }
  .meta { min-width: 0; flex: 1; }
  .card .name { font-size: 13px; line-height: 1.15; margin-top: 3px; }
  .card .code { font-family: ui-monospace, Consolas, monospace; font-size: 10px; letter-spacing: .06em; font-weight: 700; }
  .barcode svg { display: block; width: 100%; height: auto; }
  .center { text-align: center; font-family: ui-monospace, Consolas, monospace; font-size: 10px; letter-spacing: .08em; margin-top: 1px; }
  @media print {
    html, body { background: #fff; }
    .sheet { padding: 0; gap: 10mm; }
    .ticket, .card { break-inside: avoid; page-break-inside: avoid; }
  }
`;

function portrait(data: PrintableRegistration, cls: string) {
  const src = portraitSrc(data.photoDataUrl);
  if (src) return `<img class="${cls}" src="${src}" alt="Identity" />`;
  return `<div class="ph">PHOTO</div>`;
}

export function ticketHtml(data: PrintableRegistration) {
  const q = data.queueNumber != null ? `Q${data.queueNumber}` : "Q—";
  const kind = data.isAppointment === false ? "Walk-in" : "Appointment";
  const when = timeLabel(data.startsAt);
  return `<article class="ticket">
    <div class="ticket-head">
      <div>
        <div class="brand">${esc(data.clinicName || "DEMSTA Dental Care")}</div>
        <div class="muted">Queue ticket · ${kind}</div>
      </div>
    </div>
    <div class="q">${esc(q)}</div>
    <div class="name">${esc(data.patientName)}</div>
    <div class="row">${esc(data.patientCode)} · ${esc(deptLabel(data.department))}</div>
    <div class="row">${esc(data.serviceName || "Visit")}${data.staffName ? ` · ${esc(data.staffName)}` : ""}</div>
    ${when ? `<div class="row muted">${esc(when)}</div>` : ""}
    <div class="ticket-id">
      ${portrait(data, "mini")}
      <div class="barcode">${barcodeSvg(data.patientCode, 40)}</div>
    </div>
    <div class="center">${esc(data.patientCode)}</div>
  </article>`;
}

export function cardHtml(data: PrintableRegistration) {
  const extras = [data.sex, data.dateOfBirth, data.phone].filter(Boolean).join(" · ");
  return `<article class="card">
    <div class="card-top">
      ${portrait(data, "portrait")}
      <div class="meta">
        <div class="brand">${esc(data.clinicName || "DEMSTA Dental Care")}</div>
        <div class="muted">Patient identity card</div>
        <div class="name">${esc(data.patientName)}</div>
        <div class="code">${esc(data.patientCode)}</div>
        ${data.hospitalReg ? `<div class="row">Hosp. ${esc(data.hospitalReg)}</div>` : ""}
        ${data.nationalId ? `<div class="row">ID ${esc(data.nationalId)}</div>` : ""}
        ${extras ? `<div class="row muted">${esc(extras)}</div>` : ""}
        <div class="row muted">${esc(deptLabel(data.department))}</div>
      </div>
    </div>
    <div>
      <div class="barcode">${barcodeSvg(data.patientCode, 28)}</div>
      <div class="center">${esc(data.patientCode)}</div>
    </div>
  </article>`;
}

export function buildPrintDocument(title: string, body: string, kind: RegistrationPrintKind) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title>
    <style>${pageRule(kind)}${SHEET_CSS}</style></head>
    <body><div class="sheet">${body}</div></body></html>`;
}

export function queueTicketDocument(data: PrintableRegistration) {
  return buildPrintDocument(`Queue ${data.queueNumber ?? data.patientCode}`, ticketHtml(data), "ticket");
}

export function patientCardDocument(data: PrintableRegistration) {
  return buildPrintDocument(`Card ${data.patientCode}`, cardHtml(data), "card");
}

export function registrationPackDocument(data: PrintableRegistration) {
  return buildPrintDocument(
    `Registration ${data.patientCode}`,
    `${ticketHtml(data)}${cardHtml(data)}`,
    "pack",
  );
}

function ensurePrintFrame(): HTMLIFrameElement {
  let frame = document.getElementById(PRINT_FRAME_ID) as HTMLIFrameElement | null;
  if (frame?.contentDocument && frame.contentWindow) return frame;
  frame?.remove();
  frame = document.createElement("iframe");
  frame.id = PRINT_FRAME_ID;
  frame.setAttribute("title", "Print");
  frame.setAttribute("aria-hidden", "true");
  frame.style.cssText =
    "position:fixed;width:210mm;height:297mm;left:-100vw;top:0;border:0;opacity:0;pointer-events:none;";
  document.body.appendChild(frame);
  return frame;
}

export function printHtmlDocument(html: string) {
  const frame = ensurePrintFrame();
  const doc = frame.contentDocument;
  const win = frame.contentWindow;
  if (!doc || !win) {
    throw new Error("Could not open a print view. Try again, or press Ctrl+P on the preview.");
  }
  doc.open();
  doc.write(html);
  doc.close();
  win.focus();
  win.print();
}

export function printIframeWindow(frame: HTMLIFrameElement | null) {
  const win = frame?.contentWindow;
  const doc = frame?.contentDocument;
  if (!win || !doc?.body || !doc.body.innerHTML.trim()) {
    throw new Error("Preview is not ready yet. Wait a moment, then print again.");
  }
  win.focus();
  win.print();
}

export function printQueueTicket(data: PrintableRegistration) {
  printHtmlDocument(queueTicketDocument(data));
}

export function printPatientCard(data: PrintableRegistration) {
  printHtmlDocument(patientCardDocument(data));
}

export function printRegistrationPack(data: PrintableRegistration) {
  printHtmlDocument(registrationPackDocument(data));
}

export function registrationPrintData(input: {
  patient: {
    patient_code: string;
    first_name: string;
    last_name: string;
    date_of_birth?: string | null;
    sex?: string | null;
    phone?: string | null;
    national_id?: string | null;
    hospital_reg_number?: string | null;
  };
  photoDataUrl?: string | null;
  clinicName?: string;
  queueNumber?: number | null;
  serviceName?: string | null;
  department?: string | null;
  staffName?: string | null;
  startsAt?: string | null;
  isAppointment?: boolean;
}): PrintableRegistration {
  return {
    clinicName: input.clinicName,
    patientCode: input.patient.patient_code,
    patientName: `${input.patient.first_name} ${input.patient.last_name}`.trim(),
    dateOfBirth: input.patient.date_of_birth,
    sex: input.patient.sex,
    phone: input.patient.phone,
    nationalId: input.patient.national_id,
    hospitalReg: input.patient.hospital_reg_number,
    photoDataUrl: input.photoDataUrl || null,
    queueNumber: input.queueNumber,
    serviceName: input.serviceName,
    department: input.department,
    staffName: input.staffName,
    startsAt: input.startsAt,
    isAppointment: input.isAppointment,
  };
}
