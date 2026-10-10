import Link from "next/link";
import type { ComponentProps } from "react";

type Variant = "gold" | "volt" | "ghost" | "outline";
type Size = "sm" | "md" | "lg";

const base =
  "press inline-flex items-center justify-center gap-2 font-medium rounded-xl " +
  "transition-[background,color,border-color,transform] duration-200 ease-[var(--ease-tunnel)] " +
  "disabled:opacity-40 disabled:pointer-events-none select-none whitespace-nowrap";

const variants: Record<Variant, string> = {
  gold: "bg-gold text-bg-0 hover:bg-gold-hi font-semibold shadow-[0_0_0_0_transparent] hover:shadow-[0_0_28px_-8px_var(--color-gold)]",
  volt: "bg-volt text-bg-0 hover:brightness-110 font-semibold hover:shadow-[0_0_28px_-6px_var(--color-volt)]",
  ghost: "text-text-1 hover:text-text-0 hover:bg-bg-3",
  outline: "border border-line-strong text-text-0 hover:border-volt hover:text-volt bg-transparent hover:shadow-[0_0_24px_-14px_var(--color-volt)]",
};

const sizes: Record<Size, string> = {
  sm: "h-9 px-3 text-sm",
  md: "h-11 px-5 text-sm",
  lg: "h-13 px-7 text-base",
};

interface CommonProps {
  variant?: Variant;
  size?: Size;
  className?: string;
}

export function Button({
  variant = "outline",
  size = "md",
  className = "",
  ...props
}: CommonProps & ComponentProps<"button">) {
  return (
    <button className={`${base} ${variants[variant]} ${sizes[size]} ${className}`} {...props} />
  );
}

export function ButtonLink({
  variant = "outline",
  size = "md",
  className = "",
  ...props
}: CommonProps & ComponentProps<typeof Link>) {
  return (
    <Link className={`${base} ${variants[variant]} ${sizes[size]} ${className}`} {...props} />
  );
}
