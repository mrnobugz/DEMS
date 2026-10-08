import type { ComponentProps, ReactNode } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export function Dialog(props: ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root {...props} />;
}

export function DialogTrigger(props: ComponentProps<typeof DialogPrimitive.Trigger>) {
  return <DialogPrimitive.Trigger {...props} />;
}

export function DialogContent({
  className,
  children,
  title,
  description,
  ...props
}: ComponentProps<typeof DialogPrimitive.Content> & { title: string; description?: string }) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-[70] bg-ink/45" />
      <DialogPrimitive.Content
        className={cn(
          "glass-panel fixed left-1/2 top-1/2 z-[80] w-[min(32rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 p-5 outline-none",
          className,
        )}
        {...props}
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <DialogPrimitive.Title className="font-display text-lg font-bold text-brand-900">{title}</DialogPrimitive.Title>
            {description && (
              <DialogPrimitive.Description className="mt-1 text-sm text-muted">{description}</DialogPrimitive.Description>
            )}
          </div>
          <DialogPrimitive.Close className="btn-ghost min-h-11 min-w-11 px-2.5" aria-label="Close">
            <X size={16} aria-hidden />
          </DialogPrimitive.Close>
        </div>
        {children}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

export function Sheet({ children, ...props }: ComponentProps<typeof DialogPrimitive.Root> & { children: ReactNode }) {
  return <DialogPrimitive.Root {...props}>{children}</DialogPrimitive.Root>;
}

export function SheetContent({
  className,
  children,
  title = "Menu",
  description = "Navigation and account",
  side = "left",
  ...props
}: ComponentProps<typeof DialogPrimitive.Content> & {
  title?: string;
  description?: string;
  side?: "left" | "right";
}) {
  const right = side === "right";
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className={right ? "fixed inset-0 z-[70] bg-ink/45" : "fixed inset-0 z-[70] bg-ink/45 lg:hidden"} />
      <DialogPrimitive.Content
        className={cn(
          right
            ? "fixed inset-y-0 right-0 z-[80] flex h-full w-[min(36rem,calc(100vw-1rem))] flex-col overflow-auto bg-[var(--bg-surface)] p-4 shadow-overlay outline-none"
            : "fixed inset-y-0 left-0 z-[80] flex h-full w-[min(280px,calc(100vw-1rem))] flex-col bg-[var(--bg-surface)] p-3 shadow-overlay outline-none",
          className,
        )}
        {...props}
      >
        <DialogPrimitive.Title className="sr-only">{title}</DialogPrimitive.Title>
        <DialogPrimitive.Description className="sr-only">{description}</DialogPrimitive.Description>
        {children}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}
