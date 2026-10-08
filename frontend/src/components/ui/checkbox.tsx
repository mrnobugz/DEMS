import type { ComponentProps, ReactNode } from "react";
import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export function Checkbox({
  label,
  className,
  ...props
}: ComponentProps<typeof CheckboxPrimitive.Root> & { label: ReactNode }) {
  return (
    <label className="flex min-h-11 items-center gap-3 text-sm font-medium text-[var(--text-primary)]">
      <CheckboxPrimitive.Root
        className={cn(
          "grid h-5 w-5 shrink-0 place-items-center rounded-md border border-[var(--border-strong)] bg-[var(--bg-surface)]",
          "data-[state=checked]:border-transparent data-[state=checked]:bg-[var(--demsta-brand-600)] data-[state=checked]:text-white",
          className,
        )}
        {...props}
      >
        <CheckboxPrimitive.Indicator>
          <Check size={14} aria-hidden />
        </CheckboxPrimitive.Indicator>
      </CheckboxPrimitive.Root>
      <span>{label}</span>
    </label>
  );
}
