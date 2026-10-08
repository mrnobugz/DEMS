import type { ComponentProps } from "react";
import * as SwitchPrimitive from "@radix-ui/react-switch";
import { cn } from "@/lib/utils";

export function Switch({
  label,
  className,
  ...props
}: ComponentProps<typeof SwitchPrimitive.Root> & { label: string }) {
  return (
    <label className="flex min-h-11 items-center justify-between gap-3 text-sm font-semibold text-[var(--text-primary)]">
      <span>{label}</span>
      <SwitchPrimitive.Root
        className={cn(
          "relative h-7 w-12 shrink-0 rounded-full border border-[var(--border-strong)] bg-[var(--surface-3)]",
          "data-[state=checked]:bg-[var(--demsta-brand-600)]",
          className,
        )}
        {...props}
      >
        <SwitchPrimitive.Thumb className="block h-5 w-5 translate-x-1 rounded-full bg-white shadow transition data-[state=checked]:translate-x-6" />
      </SwitchPrimitive.Root>
    </label>
  );
}
