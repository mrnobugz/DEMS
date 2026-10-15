import { Link } from "react-router-dom";
import {
  Bell,
  Building2,
  CalendarDays,
  FolderOpen,
  Receipt,
  Sparkles,
  Stethoscope,
  Users,
  type LucideIcon,
} from "lucide-react";
import { catalog } from "../data/content";
import { useI18n } from "../i18n/LanguageProvider";

const icons: Record<string, LucideIcon> = {
  patients: Users,
  schedule: CalendarDays,
  clinical: Stethoscope,
  operations: FolderOpen,
  billing: Receipt,
  insight: Sparkles,
  engagement: Bell,
  platform: Building2,
};

export function ServiceGrid({ limit, linked = true }: { limit?: number; linked?: boolean }) {
  const { lang, m } = useI18n();
  const services = catalog(lang).services;
  const items = typeof limit === "number" ? services.slice(0, limit) : services;
  return (
    <div className="mt-8 grid gap-6 md:grid-cols-2">
      {items.map((service) => {
        const Icon = icons[service.id] ?? Stethoscope;
        return (
          <article id={service.id} key={service.id} className="panel overflow-hidden">
            {service.image ? (
              <img src={service.image} alt="" className="h-48 w-full object-cover" />
            ) : null}
            <div className="p-6">
              <div className="flex items-start gap-3">
                <span className="grid h-11 w-11 shrink-0 place-items-center bg-mist text-primary" aria-hidden="true">
                  <Icon size={22} />
                </span>
                <div>
                  <h3 className="font-display text-2xl font-semibold">{service.title}</h3>
                  <p className="muted mt-2">{service.summary}</p>
                </div>
              </div>
              <ul className="mt-4 space-y-2 text-sm">
                {service.points.map((point) => (
                  <li key={point} className="flex gap-2">
                    <span aria-hidden="true" className="text-primary">
                      ✓
                    </span>
                    <span>{point}</span>
                  </li>
                ))}
              </ul>
              {linked ? (
                <Link className="mt-4 inline-flex min-h-11 items-center font-semibold text-primary" to={`/services#${service.id}`}>
                  {m.home.serviceDetails}
                </Link>
              ) : null}
            </div>
          </article>
        );
      })}
    </div>
  );
}
