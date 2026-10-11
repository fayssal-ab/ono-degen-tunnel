// Original, generic brand glyphs (monogram / simple shapes in brand colors) for
// social + casino links — not reproductions of the companies' actual logos.
type Brand = "kick" | "discord" | "twitch" | "rainbet" | "stake";

export function BrandIcon({ brand, className = "h-4 w-4" }: { brand: Brand; className?: string }) {
  switch (brand) {
    case "kick":
      // monogram "K" badge
      return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden fill="currentColor">
          <rect x="2" y="2" width="20" height="20" rx="5" />
          <path d="M8 7h2.4v3.4L13.4 7H16l-3.4 4 3.6 6h-2.7l-2.4-4-.7.8V17H8V7Z" fill="var(--color-bg-0)" />
        </svg>
      );
    case "discord":
      // rounded chat bubble with two dots
      return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 5.5h14a2 2 0 0 1 2 2V16a2 2 0 0 1-2 2h-6l-4 3v-3H5a2 2 0 0 1-2-2V7.5a2 2 0 0 1 2-2Z" />
          <circle cx="9" cy="11.5" r="1.3" fill="currentColor" stroke="none" />
          <circle cx="15" cy="11.5" r="1.3" fill="currentColor" stroke="none" />
        </svg>
      );
    case "twitch":
      return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 4h14v10l-4 4h-4l-3 3v-3H5V4Z" />
          <path d="M11 8v4M15 8v4" />
        </svg>
      );
    case "rainbet":
    case "stake":
      // generic "chips" glyph for casinos
      return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden fill="none" stroke="currentColor" strokeWidth="1.8">
          <circle cx="12" cy="12" r="8" />
          <circle cx="12" cy="12" r="3.2" />
          <path d="M12 4v3M12 17v3M4 12h3M17 12h3" strokeLinecap="round" />
        </svg>
      );
  }
}
