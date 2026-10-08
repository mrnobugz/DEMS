import type { ComponentProps } from "react";
import * as Menu from "@radix-ui/react-dropdown-menu";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export function DropdownMenu(props: ComponentProps<typeof Menu.Root>) {
  return <Menu.Root {...props} />;
}

export function DropdownMenuTrigger(props: ComponentProps<typeof Menu.Trigger>) {
  return <Menu.Trigger {...props} />;
}

export function DropdownMenuContent({ className, sideOffset = 8, ...props }: ComponentProps<typeof Menu.Content>) {
  return (
    <Menu.Portal>
      <Menu.Content
        sideOffset={sideOffset}
        className={cn(
          "z-[80] min-w-52 rounded-panel border border-border bg-[var(--bg-surface)] p-1 text-[var(--text-primary)] shadow-overlay outline-none",
          className,
        )}
        {...props}
      />
    </Menu.Portal>
  );
}

export function DropdownMenuItem({ className, ...props }: ComponentProps<typeof Menu.Item>) {
  return (
    <Menu.Item
      className={cn(
        "flex min-h-11 cursor-pointer items-center gap-2 rounded-md px-3 text-sm font-semibold outline-none data-[highlighted]:bg-[var(--surface-2)]",
        className,
      )}
      {...props}
    />
  );
}

export function DropdownMenuLabel({ className, ...props }: ComponentProps<typeof Menu.Label>) {
  return <Menu.Label className={cn("px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted", className)} {...props} />;
}

export function DropdownMenuSeparator(props: ComponentProps<typeof Menu.Separator>) {
  return <Menu.Separator className="my-1 h-px bg-[var(--border)]" {...props} />;
}

export function DropdownMenuRadioGroup(props: ComponentProps<typeof Menu.RadioGroup>) {
  return <Menu.RadioGroup {...props} />;
}

export function DropdownMenuRadioItem({ className, children, ...props }: ComponentProps<typeof Menu.RadioItem>) {
  return (
    <Menu.RadioItem
      className={cn(
        "relative flex min-h-11 cursor-pointer items-center rounded-md pl-8 pr-3 text-sm font-semibold outline-none data-[highlighted]:bg-[var(--surface-2)]",
        className,
      )}
      {...props}
    >
      <Menu.ItemIndicator className="absolute left-2">
        <Check size={14} aria-hidden />
      </Menu.ItemIndicator>
      {children}
    </Menu.RadioItem>
  );
}
