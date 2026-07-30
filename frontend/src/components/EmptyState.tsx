import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Inbox } from "lucide-react";

type Props = {
  title: string;
  hint?: string;
  icon?: LucideIcon;
  action?: ReactNode;
};

export function EmptyState({ title, hint, icon: Icon = Inbox, action }: Props) {
  return (
    <div className="empty-state animate-rise" role="status">
      <div className="empty-state__icon" aria-hidden>
        <Icon size={22} />
      </div>
      <h3 className="font-display text-lg font-bold text-brand-900">{title}</h3>
      {hint && <p className="max-w-sm text-sm text-muted">{hint}</p>}
      {action}
    </div>
  );
}
