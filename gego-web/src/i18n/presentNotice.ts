import type { Notice } from "../lib/portalStore";
import { formatDate, formatTsh } from "../lib/money";
import type { Lang, Messages } from "./messages";

export function presentNotice(notice: Notice, m: Messages, lang: Lang) {
  if (notice.kind === "invoice") {
    return {
      title: notice.paid ? m.portal.noticePaid : m.portal.noticeDue,
      body: notice.paid
        ? `${notice.number} ${m.portal.marked}`
        : `${notice.number} · ${formatTsh(notice.amount ?? 0)} ${m.portal.noticeDueBody} ${formatDate(notice.due ?? "", lang)}.`,
    };
  }
  if (notice.kind === "rename") return { title: m.portal.noticeRename, body: m.portal.noticeRenameBody };
  if (notice.kind === "portal") return { title: m.portal.noticePortal, body: m.portal.noticePortalBody };
  const booking = notice.booking;
  const title =
    booking?.kind === "appointment"
      ? m.portal.noticeAppointment
      : booking?.kind === "message"
        ? m.portal.noticeMessage
        : m.portal.noticeDemo;
  return { title, body: `${booking?.title ?? ""}. ${booking?.detail ?? ""}`.trim() };
}
