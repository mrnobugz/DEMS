import { Link } from "react-router-dom";
import { presentNotice } from "../../i18n/presentNotice";
import { useI18n } from "../../i18n/LanguageProvider";
import { formatDate } from "../../lib/money";
import { markAllRead, markRead, noticesFor, usePortal } from "../../lib/portalStore";
import { usePageTitle } from "../../lib/usePageTitle";

export function NotificationsPage() {
  const { lang, m } = useI18n();
  const p = m.portal;
  usePageTitle(p.notifications);
  const portal = usePortal();
  const notices = noticesFor(portal);
  const unread = notices.filter((notice) => !notice.read);

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="kicker">{p.notifications}</p>
          <h1 className="mt-2 font-display text-3xl font-bold">{p.notesTitle}</h1>
          <p className="muted mt-2">{unread.length === 0 ? p.caughtUp : `${unread.length} ${p.unreadCount}.`}</p>
        </div>
        <button className="btn btn-ghost" type="button" disabled={unread.length === 0} onClick={() => markAllRead(notices.map((notice) => notice.id))}>
          {p.markAll}
        </button>
      </div>
      <ul className="mt-6 space-y-3">
        {notices.map((notice) => {
          const text = presentNotice(notice, m, lang);
          return (
            <li key={notice.id} className="panel p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="font-display text-lg font-semibold">{text.title}</h2>
                  <p className="mt-1 text-sm">{text.body}</p>
                  <p className="muted mt-1 text-sm">
                    {formatDate(notice.at, lang)} · {notice.read ? m.status.read : m.status.unread}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Link className="btn btn-ghost" to={notice.href}>
                    {p.open}
                  </Link>
                  {notice.read ? null : (
                    <button className="btn btn-primary" type="button" onClick={() => markRead(notice.id)}>
                      {p.markRead}
                    </button>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
