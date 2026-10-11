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
  watermark,
  align = "left",
  accent = "cyan",
}: {
  kicker?: string;
  title: string;
  action?: ReactNode;
  /** giant outlined word tucked behind the title (editorial watermark) */
  watermark?: string;
  align?: "left" | "right";
  accent?: "gold" | "cyan";
}) {
  // plain heading (no watermark)
  if (!watermark) {
    return (
      <div className="mb-5 flex items-end justify-between gap-4">
        <div>
          {kicker && <p className="label">{kicker}</p>}
          <h2 className="font-bang mt-1 text-2xl tracking-wide md:text-3xl">{title}</h2>
        </div>
        {action}
      </div>
    );
  }

  const right = align === "right";
  return (
    <div className={`relative mb-6 overflow-hidden ${right ? "text-right" : ""}`}>
      <span
        aria-hidden
        className={`watermark ${accent === "gold" ? "watermark-gold" : "watermark-cyan"} ${right ? "ml-auto" : "-ml-0.5"}`}
      >
        {watermark}
      </span>
      <div
        className={`relative z-10 -mt-[0.32em] flex items-end gap-4 ${
          right ? "flex-row-reverse" : "justify-between"
        }`}
      >
        <div>
          {kicker && <p className="label">{kicker}</p>}
          <h2 className="font-bang mt-1 text-2xl tracking-wide md:text-3xl">{title}</h2>
        </div>
        {action}
      </div>
    </div>
  );
}
