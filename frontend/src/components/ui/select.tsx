import type { ReactNode } from "react";
import * as SelectPrimitive from "@radix-ui/react-select";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export function Select({
  label,
  value,
  onValueChange,
  placeholder = "Select",
  children,
  disabled,
  name,
}: {
  label: string;
  value?: string;
  onValueChange?: (value: string) => void;
  placeholder?: string;
  children: ReactNode;
  disabled?: boolean;
  name?: string;
}) {
  return (
    <label className="block text-sm">
      <span className="label">{label}</span>
      <SelectPrimitive.Root value={value} onValueChange={onValueChange} disabled={disabled} name={name}>
        <SelectPrimitive.Trigger
          className="input flex items-center justify-between gap-2 text-left"
          aria-label={label}
        >
          <SelectPrimitive.Value placeholder={placeholder} />
          <SelectPrimitive.Icon>
            <ChevronDown size={16} aria-hidden />
          </SelectPrimitive.Icon>
        </SelectPrimitive.Trigger>
        <SelectPrimitive.Portal>
          <SelectPrimitive.Content
            className="z-[80] overflow-hidden rounded-panel border border-border bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-overlay"
            position="popper"
            sideOffset={6}
          >
            <SelectPrimitive.Viewport className="p-1">{children}</SelectPrimitive.Viewport>
          </SelectPrimitive.Content>
        </SelectPrimitive.Portal>
      </SelectPrimitive.Root>
    </label>
  );
}

export function SelectItem({ value, children }: { value: string; children: ReactNode }) {
  return (
    <SelectPrimitive.Item
      value={value}
      className={cn(
        "relative flex min-h-11 cursor-pointer items-center rounded-md px-8 text-sm outline-none",
        "data-[highlighted]:bg-[var(--surface-2)]",
      )}
    >
      <SelectPrimitive.ItemIndicator className="absolute left-2">
        <Check size={14} aria-hidden />
      </SelectPrimitive.ItemIndicator>
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
    </SelectPrimitive.Item>
  );
}
