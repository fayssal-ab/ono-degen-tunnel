import { AppShell } from "@/components/shell/AppShell";

// Public site chrome (sidebar, top bar, footer). Admin + /login live outside
// this group and render without the public shell.
export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
