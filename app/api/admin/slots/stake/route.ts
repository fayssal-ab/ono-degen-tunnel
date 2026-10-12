import { z } from "zod";
import { isAdminRequest } from "@/lib/admin";
import { json, jsonError, isSameOrigin } from "@/lib/http";
import { logAudit } from "@/lib/audit";
import { EventError } from "@/lib/events/common";
import { matchStakeNames, markOnStake, addStakeOnlySlot, getStakeSlots, getCatalogStats, verifyBatch } from "@/lib/slotCatalog";

// Admin curation of which slots are on Stake (Stake has no public game API).
export const dynamic = "force-dynamic";
export const maxDuration = 26;

const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("match"), text: z.string().max(60_000) }),
  z.object({ action: z.enum(["mark", "unmark"]), ids: z.array(z.string().min(1).max(191)).min(1).max(1000) }),
  z.object({ action: z.literal("add"), name: z.string().trim().min(1).max(191), provider: z.string().trim().min(1).max(120), imageUrl: z.string().trim().min(1).max(512) }),
  z.object({ action: z.literal("list") }),
]);

export async function POST(request: Request) {
  if (!isAdminRequest(request)) return jsonError("unauthorized", 401);
  if (!isSameOrigin(request)) return jsonError("bad_origin", 403);
  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(await request.json());
  } catch {
    return jsonError("invalid_body", 400);
  }
  try {
    switch (body.action) {
      case "match":
        return json({ ok: true, matches: await matchStakeNames(body.text) });
      case "mark":
      case "unmark": {
        const n = await markOnStake(body.ids, body.action === "mark");
        await logAudit("admin", `slots.stake_${body.action}`, "", { count: n });
        // check art of newly marked slots right away (time-boxed)
        if (body.action === "mark") await verifyBatch(200, 3500).catch(() => null);
        break;
      }
      case "add": {
        const id = await addStakeOnlySlot(body);
        await logAudit("admin", "slots.stake_add", id, { name: body.name, provider: body.provider });
        break;
      }
      case "list":
        break;
    }
    return json({ ok: true, slots: await getStakeSlots(), stats: await getCatalogStats() });
  } catch (err) {
    if (err instanceof EventError) return json({ ok: false, error: err.code, detail: err.detail ?? null }, 409);
    console.error("stake slots action failed", err instanceof Error ? err.message : "unknown");
    return json({ ok: false, error: "unexpected" }, 500);
  }
}
