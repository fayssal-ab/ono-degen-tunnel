// Thin progress/meter bar. `tone` picks the fill color. value is 0..1.
export function ProgressBar({
  value,
  tone = "gold",
  className = "",
}: {
  value: number;
  tone?: "gold" | "volt" | "plasma";
  className?: string;
}) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  const fill = tone === "volt" ? "bg-volt" : tone === "plasma" ? "bg-plasma" : "bg-gold";
  return (
    <div className={`h-2 w-full overflow-hidden rounded-full bg-bg-3 ${className}`}>
      <div className={`h-full rounded-full ${fill} transition-[width] duration-500`} style={{ width: `${pct}%` }} />
    </div>
  );
}
