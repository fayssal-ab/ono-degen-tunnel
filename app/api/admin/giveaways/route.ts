import { z } from "zod";
import { isAdminRequest } from "@/lib/admin";
import { json, jsonError, isSameOrigin } from "@/lib/http";
import { createGiveaway } from "@/lib/giveaways";
import { logAudit } from "@/lib/audit";

// Create a giveaway (Kick-chat / keyword only). Called by the "New giveaway"
// modal; returns the new id so the client can open its Control Vault.
export const dynamic = "force-dynamic";

const Body = z.object({
  title: z.string().trim().max(120).optional(),
  prize: z.string().trim().max(120).optional(),
  keyword: z.string().trim().max(64).optional(),
  entry_condition: z.string().trim().max(255).optional(),
  subscribers_only: z.boolean().optional(),
  ends_at: z.string().trim().max(40).refine((v) => !v || Number.isFinite(Date.parse(v)), "invalid_date").optional(),
});

export async function POST(request: Request) {
  if (!isAdminRequest(request)) return jsonError("unauthorized", 401);
  if (!isSameOrigin(request)) return jsonError("bad_origin", 403);

  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(await request.json());
  } catch {
    return jsonError("invalid_body", 400);
  }

  const keyword = (body.keyword || "!win").trim();
  const id = await createGiveaway({
    title: body.title?.trim() || "Giveaway",
    type: "keyword",
    keyword,
    entry_condition: body.entry_condition?.trim() || `Type ${keyword} in Kick chat while live`,
    prize: body.prize?.trim() || "",
    subscribers_only: Boolean(body.subscribers_only),
    min_messages: 1,
    ends_at: body.ends_at ? new Date(body.ends_at).toISOString().slice(0, 19).replace("T", " ") : null,
  });
  await logAudit("admin", "giveaway.create", String(id));
  return json({ id });
}
