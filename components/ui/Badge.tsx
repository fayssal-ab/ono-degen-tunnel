import type { ReactNode } from "react";

type Tone = "gold" | "volt" | "plasma" | "neutral" | "danger";

const tones: Record<Tone, string> = {
  gold: "border-gold/40 text-gold bg-gold/10",
  volt: "border-volt/40 text-volt bg-volt/10",
  plasma: "border-plasma/40 text-plasma bg-plasma/10",
  neutral: "border-line-strong text-text-1 bg-bg-3",
  danger: "border-danger/40 text-danger bg-danger/10",
};

export function Badge({
  children,
  tone = "neutral",
  className = "",
}: {
  children: ReactNode;
  tone?: Tone;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${tones[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

export function SectionHeading({
  kicker,
  title,
  action,
}: {
  kicker?: string;
  title: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-5 flex items-end justify-between gap-4">
      <div>
        {kicker && <p className="label">{kicker}</p>}
        <h2 className="mt-1 text-xl md:text-2xl">{title}</h2>
      </div>
      {action}
    </div>
  );
}
