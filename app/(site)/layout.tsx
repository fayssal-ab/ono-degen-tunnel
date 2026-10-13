import { preload } from "react-dom";
import { AppShell } from "@/components/shell/AppShell";

// Public site chrome (sidebar, top bar, footer). Admin + /login live outside
// this group and render without the public shell.
export default function SiteLayout({ children }: { children: React.ReactNode }) {
  // fetched first: shown by the loading screen and the home hero
  preload("/LOGO/logo-320.webp", { as: "image", fetchPriority: "high" });
  return <AppShell>{children}</AppShell>;
}
