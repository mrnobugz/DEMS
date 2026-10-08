import type { ComponentProps, ReactNode } from "react";
import * as RadioGroupPrimitive from "@radix-ui/react-radio-group";
import { cn } from "@/lib/utils";

export function RadioGroup({
  label,
  className,
  children,
  ...props
}: ComponentProps<typeof RadioGroupPrimitive.Root> & { label: string }) {
  return (
    <fieldset className="space-y-1">
      <legend className="label">{label}</legend>
      <RadioGroupPrimitive.Root className={cn("grid gap-1", className)} {...props}>
        {children}
      </RadioGroupPrimitive.Root>
    </fieldset>
  );
}

export function RadioItem({
  label,
  className,
  ...props
}: ComponentProps<typeof RadioGroupPrimitive.Item> & { label: ReactNode }) {
  return (
    <label className="flex min-h-11 items-center gap-3 text-sm">
      <RadioGroupPrimitive.Item
        className={cn(
          "grid h-5 w-5 place-items-center rounded-full border border-[var(--border-strong)] bg-[var(--bg-surface)]",
          className,
        )}
        {...props}
      >
        <RadioGroupPrimitive.Indicator className="h-2.5 w-2.5 rounded-full bg-[var(--demsta-brand-600)]" />
      </RadioGroupPrimitive.Item>
      <span>{label}</span>
    </label>
  );
}
