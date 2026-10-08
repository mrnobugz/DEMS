import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps, ReactNode, Ref } from "react";
import { Slot } from "@radix-ui/react-slot";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--demsta-brand-500)] disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        primary: "btn-primary",
        ghost: "btn-ghost",
        danger:
          "btn-ghost border-[var(--err-bd)] bg-[var(--err-bg)] text-[var(--err-fg)] hover:bg-[var(--err-bg)]",
      },
      size: {
        md: "",
        sm: "text-sm",
        icon: "min-h-11 min-w-11 px-2.5",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export type ButtonProps = ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
    ref?: Ref<HTMLButtonElement>;
  };

export function Button({
  className,
  variant,
  size,
  asChild = false,
  type = "button",
  ref,
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp
      ref={ref}
      type={asChild ? undefined : type}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  );
}

type IconButtonProps = Omit<ComponentProps<"button">, "children" | "aria-label"> & {
  "aria-label": string;
  children: ReactNode;
  ref?: Ref<HTMLButtonElement>;
};

export function IconButton({ className, type = "button", ref, children, ...props }: IconButtonProps) {
  return (
    <button ref={ref} type={type} className={cn("btn-ghost min-h-11 min-w-11 px-2.5", className)} {...props}>
      {children}
    </button>
  );
}
