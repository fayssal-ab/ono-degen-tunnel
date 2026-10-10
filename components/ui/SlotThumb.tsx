// Slot box-art thumbnail. Remote images (slot.report / casino CDNs) are allowed
// by the CSP; falls back to a branded gradient tile with the slot's initials
// when there's no image, so a missing thumb never leaves an empty box.
export function SlotThumb({
  name,
  src,
  size = 56,
  className = "",
}: {
  name: string;
  src?: string | null;
  size?: number;
  className?: string;
}) {
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <span
      className={`relative inline-grid shrink-0 place-items-center overflow-hidden rounded-lg border border-line bg-bg-3 ${className}`}
      style={{ width: size, height: size }}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" loading="lazy" className="h-full w-full object-cover" />
      ) : (
        <span className="font-mono text-xs font-semibold text-text-2">{initials || "?"}</span>
      )}
    </span>
  );
}
