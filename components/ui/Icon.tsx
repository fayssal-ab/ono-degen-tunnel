import { icons, type LucideProps } from "lucide-react";

// Render a lucide icon by its export name (the names used in lib/nav.ts).
// Falls back to a neutral dot if a name is ever wrong, so the UI never crashes.
export function Icon({
  name,
  ...props
}: { name: string } & LucideProps) {
  const Cmp = icons[name as keyof typeof icons] ?? icons.Circle;
  return <Cmp aria-hidden {...props} />;
}
