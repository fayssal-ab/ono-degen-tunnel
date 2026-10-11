import "server-only";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { isAdminSession } from "./admin";
import { logAudit } from "./audit";
import { EventError } from "./events/common";

// Wrapper for admin Server Actions. Every action is its own POST entry point,
// so the session is checked here, not just by the /admin layout (Next also
// enforces the Origin/Host CSRF check on actions). Business errors come back
// to the page as ?error=<code>&detail=… and are explained by <Flash>;
// anything unexpected is logged without details and shown generically.

export async function requireAdmin(): Promise<void> {
  if (!(await isAdminSession())) redirect("/login");
}

export async function adminAction(
  opts: { path: string; audit: string; target?: string | number; revalidate?: string[]; ok?: string },
  fn: () => Promise<unknown>
): Promise<never> {
  await requireAdmin();
  let query: string;
  try {
    const result = await fn();
    await logAudit("admin", opts.audit, opts.target != null ? String(opts.target) : "", result ?? undefined);
    query = `ok=${encodeURIComponent(opts.ok ?? opts.audit)}`;
  } catch (err) {
    if (err instanceof EventError) {
      query = `error=${encodeURIComponent(err.code)}${err.detail ? `&detail=${encodeURIComponent(err.detail.slice(0, 300))}` : ""}`;
    } else {
      console.error(`admin action ${opts.audit} failed`, err instanceof Error ? err.message : "unknown");
      query = "error=unexpected";
    }
  }
  for (const p of [opts.path, ...(opts.revalidate ?? [])]) revalidatePath(p);
  const sep = opts.path.includes("?") ? "&" : "?";
  redirect(`${opts.path}${sep}${query}`);
}
