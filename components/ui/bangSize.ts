// The display font (font-bang, uppercase) is very wide: one long word such as
// "TOURNAMENTS" overflows a phone at the normal heading size. Pick a size that
// scales with the viewport when the longest word is long.
export function bangSize(text: string, normal: string): string {
  const longest = Math.max(0, ...text.split(/\s+/).map((w) => w.length));
  // the title column is ~42rem wide: long words get a size that still fits on one line there
  if (longest >= 10) return `text-[clamp(1.1rem,5.2vw,1.875rem)] md:text-[clamp(2rem,4.2vw,3.5rem)] [overflow-wrap:anywhere]`;
  if (longest >= 7) return `text-[clamp(1.3rem,7vw,2.25rem)] md:text-[clamp(2.25rem,5vw,4.5rem)] [overflow-wrap:anywhere]`;
  return normal;
}
