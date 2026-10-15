import { useSyncExternalStore } from "react";

export const DEMO_EMAIL = "clinic@gego.dental";
export const DEMO_PASSWORD = "Gego!Clinic1";

export type InvoiceStatus = "paid" | "open" | "partial" | "overdue";

export type InvoiceLineKey = "clinicNov" | "extraStaff" | "training" | "clinicOct";
export type InvoiceNoteKey = "subscription" | "trainingNote" | "paidNote";

export type Invoice = {
  id: string;
  number: string;
  issued: string;
  due: string;
  status: InvoiceStatus;
  amountPaid: number;
  lines: { key: InvoiceLineKey; amount: number }[];
  noteKey: InvoiceNoteKey;
};

export const invoices: Invoice[] = [
  {
    id: "inv-118",
    number: "INV-2026-118",
    issued: "2026-10-01",
    due: "2026-10-28",
    status: "open",
    amountPaid: 0,
    lines: [
      { key: "clinicNov", amount: 450_000 },
      { key: "extraStaff", amount: 50_000 },
    ],
    noteKey: "subscription",
  },
  {
    id: "inv-104",
    number: "INV-2026-104",
    issued: "2026-09-12",
    due: "2026-09-30",
    status: "partial",
    amountPaid: 300_000,
    lines: [{ key: "training", amount: 1_000_000 }],
    noteKey: "trainingNote",
  },
  {
    id: "inv-091",
    number: "INV-2026-091",
    issued: "2026-09-01",
    due: "2026-09-15",
    status: "paid",
    amountPaid: 450_000,
    lines: [{ key: "clinicOct", amount: 450_000 }],
    noteKey: "paidNote",
  },
];

export type InvoiceView = Invoice & { total: number; paid: number; balance: number };

export function invoiceTotal(invoice: Invoice) {
  return invoice.lines.reduce((sum, line) => sum + line.amount, 0);
}

export function invoiceView(invoice: Invoice, paidIds: string[]): InvoiceView {
  const total = invoiceTotal(invoice);
  const status: InvoiceStatus = paidIds.includes(invoice.id) ? "paid" : invoice.status;
  const paid = status === "paid" ? total : invoice.amountPaid;
  return { ...invoice, status, total, paid, balance: Math.max(0, total - paid) };
}

export type Ticket = {
  id: string;
  subject: string;
  body: string;
  created: string;
  status: "open" | "answered";
  reply?: string;
  subjectKey?: "secondSiteSubject";
  bodyKey?: "secondSiteBody";
  replyKey?: "secondSiteReply";
};

export type ClinicProfile = {
  name: string;
  code: string;
  city: string;
  chairs: string;
  phone: string;
  adminEmail: string;
};

export type Booking = {
  id: string;
  kind: "demo" | "appointment" | "message";
  title: string;
  when: string;
  detail: string;
  topic?: string;
};

export type PortalState = {
  session: { email: string } | null;
  paidInvoiceIds: string[];
  readIds: string[];
  tickets: Ticket[];
  clinic: ClinicProfile;
  bookings: Booking[];
  cardLast4: string;
  claimedPromos: string[];
};

const STORAGE_KEY = "gego-portal-v1";

function defaultState(): PortalState {
  return {
    session: null,
    paidInvoiceIds: ["inv-091"],
    readIds: [],
    tickets: [
      {
        id: "t-1",
        subject: "",
        body: "",
        created: "2026-10-02",
        status: "answered",
        subjectKey: "secondSiteSubject",
        bodyKey: "secondSiteBody",
        replyKey: "secondSiteReply",
      },
    ],
    clinic: {
      name: "Harbour Dental",
      code: "HBR",
      city: "Dar es Salaam",
      chairs: "8",
      phone: "",
      adminEmail: DEMO_EMAIL,
    },
    bookings: [],
    cardLast4: "4242",
    claimedPromos: [],
  };
}

function load(): PortalState {
  const base = defaultState();
  if (typeof localStorage === "undefined") return base;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return base;
    const parsed = JSON.parse(raw) as Partial<PortalState>;
    return {
      ...base,
      ...parsed,
      clinic: { ...base.clinic, ...(parsed.clinic ?? {}) },
      session: parsed.session ?? null,
    };
  } catch {
    return base;
  }
}

let state: PortalState = load();
const listeners = new Set<() => void>();

function setState(next: PortalState) {
  state = next;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  listeners.forEach((listener) => listener());
}

export function getPortalState() {
  return state;
}

export function subscribePortal(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function usePortal() {
  return useSyncExternalStore(subscribePortal, getPortalState, getPortalState);
}

export function signIn(email: string, password: string) {
  const normalized = email.trim().toLowerCase();
  if (normalized !== DEMO_EMAIL || password !== DEMO_PASSWORD) return "invalid" as const;
  setState({ ...state, session: { email: DEMO_EMAIL } });
  return null;
}

export function signOut() {
  setState({ ...state, session: null });
}

export function payInvoice(id: string) {
  if (state.paidInvoiceIds.includes(id)) return;
  setState({ ...state, paidInvoiceIds: [...state.paidInvoiceIds, id] });
}

export function markRead(id: string) {
  if (state.readIds.includes(id)) return;
  setState({ ...state, readIds: [...state.readIds, id] });
}

export function markAllRead(ids: string[]) {
  const merged = Array.from(new Set([...state.readIds, ...ids]));
  setState({ ...state, readIds: merged });
}

export function addTicket(subject: string, body: string) {
  const ticket: Ticket = {
    id: `t-${Date.now()}`,
    subject,
    body,
    created: new Date().toISOString().slice(0, 10),
    status: "open",
  };
  setState({ ...state, tickets: [ticket, ...state.tickets] });
}

export function saveClinic(clinic: ClinicProfile) {
  setState({ ...state, clinic });
}

export function saveCard(last4: string) {
  setState({ ...state, cardLast4: last4 });
}

export function addBooking(booking: Omit<Booking, "id">) {
  const id = `b-${Date.now()}`;
  setState({ ...state, bookings: [{ ...booking, id }, ...state.bookings] });
  return id;
}

export function claimPromo(code: string): { ok: boolean; reason: "bad" | "duplicate" | "ok"; code: string } {
  const normalized = code.trim().toUpperCase();
  const known = ["LAUNCH", "ANNUAL", "MIGRATE"];
  if (!known.includes(normalized)) return { ok: false, reason: "bad", code: normalized };
  if (state.claimedPromos.includes(normalized)) return { ok: false, reason: "duplicate", code: normalized };
  setState({ ...state, claimedPromos: [...state.claimedPromos, normalized] });
  return { ok: true, reason: "ok", code: normalized };
}

export type Notice = {
  id: string;
  kind: "invoice" | "rename" | "portal" | "booking";
  at: string;
  href: string;
  read: boolean;
  paid?: boolean;
  number?: string;
  amount?: number;
  due?: string;
  booking?: Booking;
};

export function noticesFor(current: PortalState): Notice[] {
  const novemberSource = invoices.find((invoice) => invoice.id === "inv-118");
  if (!novemberSource) return [];
  const november = invoiceView(novemberSource, current.paidInvoiceIds);
  const fixed: Omit<Notice, "read">[] = [
    {
      id: "n-due",
      kind: "invoice",
      paid: november.status === "paid",
      number: november.number,
      amount: november.balance,
      due: november.due,
      at: "2026-10-12",
      href: `/portal/invoices/${november.id}`,
    },
    { id: "n-name", kind: "rename", at: "2026-10-01", href: "/about" },
    { id: "n-portal", kind: "portal", at: "2026-09-20", href: "/docs/patient-portal" },
  ];
  const fromBookings: Omit<Notice, "read">[] = current.bookings.map((booking) => ({
    id: `n-${booking.id}`,
    kind: "booking",
    booking,
    at: booking.when.slice(0, 10),
    href: "/portal",
  }));
  return [...fromBookings, ...fixed].map((notice) => ({
    ...notice,
    read: current.readIds.includes(notice.id),
  }));
}

export function openBalance(paidIds: string[]) {
  return invoices.reduce((sum, invoice) => sum + invoiceView(invoice, paidIds).balance, 0);
}
