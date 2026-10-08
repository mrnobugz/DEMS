import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";

export function Breadcrumb({ items }: { items: { to: string; label: string }[] }) {
  if (!items.length) return null;
  return (
    <nav aria-label="Breadcrumb" className="min-w-0">
      <ol className="flex min-w-0 flex-wrap items-center gap-1 text-sm">
        {items.map((item, index) => {
          const last = index === items.length - 1;
          return (
            <li key={`${item.to}-${item.label}`} className="flex min-w-0 items-center gap-1">
              {index > 0 && <ChevronRight size={14} className="shrink-0 text-muted" aria-hidden />}
              {last ? (
                <span className="truncate font-semibold text-ink" aria-current="page">
                  {item.label}
                </span>
              ) : (
                <Link to={item.to} className="truncate font-medium text-muted hover:text-brand-700">
                  {item.label}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
