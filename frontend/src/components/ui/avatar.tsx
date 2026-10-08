import { cn } from "@/lib/utils";

export function Avatar({ name, src, className }: { name: string; src?: string | null; className?: string }) {
  const initials = name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
  if (src) {
    return <img src={src} alt="" className={cn("h-11 w-11 rounded-full object-cover", className)} />;
  }
  return (
    <span
      className={cn(
        "grid h-11 w-11 place-items-center rounded-full bg-brand-100 text-sm font-bold text-brand-800",
        className,
      )}
      aria-hidden
    >
      {initials || "?"}
    </span>
  );
}
