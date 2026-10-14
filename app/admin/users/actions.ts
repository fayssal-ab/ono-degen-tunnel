"use server";

import { z } from "zod";
import { adminAction } from "@/lib/adminAction";
import { parseForm, zId, zText } from "@/lib/events/common";
import { setBanned, signOutEverywhere, deleteUser } from "@/lib/userAdmin";

// Admin → Users actions, shared by the list and the user detail page.

/** Return to the same list search / filter / page or user page after an action (only these pages' own URLs). */
function back(formData: FormData): string {
  const b = String(formData.get("back") ?? "");
  return /^\/admin\/users(\/\d+)?(\?[\w=&%.+-]*)?$/.test(b) ? b : "/admin/users";
}

export async function banAction(formData: FormData) {
  await adminAction({ path: back(formData), audit: "user.ban", target: String(formData.get("id")) }, async () => {
    const f = parseForm(z.object({ id: zId, reason: zText(255) }), formData);
    await setBanned(f.id, true, f.reason);
    return { reason: f.reason };
  });
}
export async function unbanAction(formData: FormData) {
  await adminAction({ path: back(formData), audit: "user.unban", target: String(formData.get("id")) }, async () => {
    await setBanned(parseForm(z.object({ id: zId }), { id: formData.get("id") }).id, false, "");
  });
}
export async function signOutAction(formData: FormData) {
  await adminAction({ path: back(formData), audit: "user.signout", target: String(formData.get("id")) }, async () => {
    return { sessions: await signOutEverywhere(parseForm(z.object({ id: zId }), { id: formData.get("id") }).id) };
  });
}
export async function deleteAction(formData: FormData) {
  // a deleted user's page no longer exists: always back to the list
  await adminAction({ path: back(formData).replace(/^\/admin\/users\/\d+/, "/admin/users"), audit: "user.delete", target: String(formData.get("id")) }, async () => {
    await deleteUser(parseForm(z.object({ id: zId }), { id: formData.get("id") }).id);
  });
}
