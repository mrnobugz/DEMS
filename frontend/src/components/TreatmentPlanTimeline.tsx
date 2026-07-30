import type { TreatmentPlan } from "@/lib/types";

/** Simple horizontal Gantt for phased treatment plans. */
export function TreatmentPlanTimeline({ plans }: { plans: TreatmentPlan[] }) {
  if (!plans.length) return null;

  return (
    <section className="glass-panel rounded-3xl p-5">
      <h3 className="font-display text-lg font-bold text-brand-900">Plan timeline</h3>
      <p className="mb-4 text-sm text-muted">Phases by target date · dependency hints</p>
      <div className="space-y-6">
        {plans.map((plan) => {
          const items = [...(plan.items || [])].sort(
            (a, b) => a.phase_order - b.phase_order || (a.target_date || "").localeCompare(b.target_date || ""),
          );
          const dates = items
            .map((i) => i.target_date)
            .filter(Boolean)
            .map((d) => new Date(d!).getTime());
          const min = dates.length ? Math.min(...dates) : Date.now();
          const max = dates.length ? Math.max(...dates) : min + 86400000 * 30;
          const span = Math.max(max - min, 86400000);

          return (
            <div key={plan.id}>
              <div className="mb-2 font-semibold text-ink">
                {plan.title}{" "}
                <span className="text-xs font-normal capitalize text-muted">· {plan.status}</span>
              </div>
              <div className="relative space-y-2 border-l-2 border-brand-200 pl-4">
                {items.map((item) => {
                  const t = item.target_date ? new Date(item.target_date).getTime() : min;
                  const left = ((t - min) / span) * 100;
                  return (
                    <div key={item.id} className="relative">
                      <div
                        className="absolute top-2 h-2 w-2 -translate-x-5 rounded-full bg-brand-500"
                        aria-hidden
                      />
                      <div className="mb-1 text-xs text-muted">
                        Phase {item.phase_order} · {item.phase_name}
                        {item.dependency_ref ? ` · depends on ${item.dependency_ref}` : ""}
                      </div>
                      <div className="relative h-8 overflow-hidden rounded-xl bg-brand-50">
                        <div
                          className={`absolute top-1 h-6 rounded-lg px-2 text-[10px] font-semibold leading-6 text-white ${
                            item.status === "completed"
                              ? "bg-emerald-500"
                              : item.status === "in_progress"
                                ? "bg-amber-500"
                                : "bg-brand-500"
                          }`}
                          style={{ left: `${Math.min(left, 85)}%`, minWidth: "28%" }}
                          title={item.procedure_name}
                        >
                          {item.tooth_number ? `${item.tooth_number} · ` : ""}
                          {item.procedure_name}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
