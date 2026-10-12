import { z } from "zod";
import { revalidatePath } from "next/cache";
import { isAdminRequest } from "@/lib/admin";
import { json, jsonError, isSameOrigin } from "@/lib/http";
import { logAudit } from "@/lib/audit";
import { EventError } from "@/lib/events/common";
import { explainError } from "@/lib/events/messages";
import {
  createKo, openRegistration, closeRegistration, resetKo, rollPlayers, confirmRoll, cancelRoll,
  startBattle, focusNext, declareWinner,
} from "@/lib/knockout";

// Admin control endpoint for the knockout dashboard. Admin cookie + same
// origin on every call; each action is audited. Business rule violations come
// back as 409 with a human explanation.
export const dynamic = "force-dynamic";

const Id = z.number().int().positive().max(2_147_483_647);
const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("create"), title: z.string().trim().min(1).max(120), prize: z.string().trim().max(120).default("") }),
  z.object({ action: z.enum(["open", "close", "reset", "roll", "confirm", "cancel_roll", "start", "next"]), id: Id }),
  z.object({ action: z.literal("winner"), id: Id, matchId: z.number().int().positive(), side: z.union([z.literal(1), z.literal(2)]) }),
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
    let result: unknown = null;
    switch (body.action) {
      case "create": result = { id: await createKo({ title: body.title, prize: body.prize }) }; break;
      case "open": await openRegistration(body.id); break;
      case "close": await closeRegistration(body.id); break;
      case "reset": await resetKo(body.id); break;
      case "roll": result = await rollPlayers(body.id); break;
      case "confirm": await confirmRoll(body.id); break;
      case "cancel_roll": await cancelRoll(body.id); break;
      case "start": result = { matchId: await startBattle(body.id) }; break;
      case "next": result = { matchId: await focusNext(body.id) }; break;
      case "winner": result = await declareWinner(body.id, body.matchId, body.side); break;
    }
    await logAudit("admin", `ko.${body.action}`, "id" in body ? String(body.id) : "", { ...body, result });
    revalidatePath("/tournaments");
    if (body.action === "winner") revalidatePath("/hall-of-fame");
    return json({ ok: true, result });
  } catch (err) {
    if (err instanceof EventError) return json({ ok: false, error: err.code, detail: err.detail ?? null, message: explainError(err.code) }, 409);
    console.error("ko action failed", err instanceof Error ? err.message : "unknown");
    return json({ ok: false, error: "unexpected", message: explainError("unexpected") }, 500);
  }
}
