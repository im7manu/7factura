import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type Variante = "primary" | "default" | "subtle" | "danger";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variante;
  size?: "sm" | "md" | "icon";
}

const estilos: Record<Variante, string> = {
  primary: "bg-brand text-brand-on hover:bg-brand-hover border border-transparent",
  default: "bg-surface text-fg border border-stroke hover:bg-subtle",
  subtle: "bg-transparent text-fg border border-transparent hover:bg-subtle",
  danger: "bg-danger text-white border border-transparent hover:opacity-90",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "md", type = "button", ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded font-semibold whitespace-nowrap transition-colors",
        "disabled:opacity-50 disabled:pointer-events-none",
        size === "md" && "h-8 px-3 text-sm",
        size === "sm" && "h-7 px-2 text-[13px]",
        size === "icon" && "h-8 w-8",
        estilos[variant],
        className,
      )}
      {...props}
    />
  ),
);
Button.displayName = "Button";
