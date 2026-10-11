import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { isAdminSession } from "@/lib/admin";
import { BRAND_NAME } from "@/lib/constants";
import { LoginForm } from "@/components/admin/LoginForm";
import { CustomCursor } from "@/components/shell/CustomCursor";

export const metadata: Metadata = { title: "Admin login", robots: { index: false } };
export const dynamic = "force-dynamic";

// Reached by URL only (no login button in the chrome). Already-authed admins
// skip straight to the dashboard.
export default async function LoginPage() {
  if (await isAdminSession()) redirect("/admin");

  return (
    <div className="flex min-h-[70vh] items-center justify-center">
      <CustomCursor />
      <div className="surface w-full max-w-sm p-8">
        <div className="mb-6 text-center">
          <p className="label">{BRAND_NAME}</p>
          <h1 className="mt-2 text-2xl">Control room</h1>
          <p className="mt-1 text-sm text-text-2">Staff only.</p>
        </div>
        <LoginForm />
      </div>
    </div>
  );
}
