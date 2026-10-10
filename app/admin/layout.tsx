import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { isAdminSession } from "@/lib/admin";
import { AdminShell } from "@/components/admin/AdminShell";

export const metadata: Metadata = { title: "Admin", robots: { index: false } };
export const dynamic = "force-dynamic";

// Guards the whole /admin subtree. Not authed → bounce to /login.
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  if (!(await isAdminSession())) redirect("/login");
  return <AdminShell>{children}</AdminShell>;
}
