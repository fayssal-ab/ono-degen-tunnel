import { z } from "zod";
import { revalidatePath } from "next/cache";
import { isAdminRequest } from "@/lib/admin";
import { json, jsonError, isSameOrigin } from "@/lib/http";
import { awardWinner, confirmWinner, getWinnerInfo, markNoShow } from "@/lib/giveaways";
import { logAudit } from "@/lib/audit";

// The drawn winner's 15 s chat window. GET: their site links (Kick / Discord)
// + the recorded prize. POST confirm: they answered in chat (or the admin
// accepts them). POST award: the admin enters the payout → prize recorded
// (ticket + notification). POST no_show: silent → no prize, reroll.
export const dynamic = "force-dynamic";

const Body = z.object({
  action: z.enum(["confirm", "no_show", "award"]),
  nonce: z.number().int().min(0),
  text: z.string().max(500).default(""),
  amount: z.string().trim().regex(/^\d{1,9}(\.\d{1,2})?$/).optional(),
});

function giveawayId(raw: string): number | null {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isAdminRequest(request)) return jsonError("unauthorized", 401);
  const id = giveawayId((await params).id);
  const nonce = Number(new URL(request.url).searchParams.get("nonce"));
  if (!id || !Number.isInteger(nonce) || nonce < 0) return jsonError("bad_id", 400);
  const info = await getWinnerInfo(id, nonce);
  return info ? json(info) : jsonError("not_found", 404);
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isAdminRequest(request)) return jsonError("unauthorized", 401);
  if (!isSameOrigin(request)) return jsonError("bad_origin", 403);
  const id = giveawayId((await params).id);
  if (!id) return jsonError("bad_id", 400);
  let b: z.infer<typeof Body>;
  try { b = Body.parse(await request.json()); } catch { return jsonError("invalid_input", 400); }
  try {
    if (b.action === "confirm") await confirmWinner(id, b.nonce, b.text);
    else if (b.action === "award") {
      if (!b.amount) return jsonError("invalid_amount", 400);
      await awardWinner(id, b.nonce, b.amount);
    } else await markNoShow(id, b.nonce);
  } catch (err) {
    if (err instanceof Error && ["winner_already_decided", "winner_not_found", "winner_not_confirmed", "winner_already_awarded"].includes(err.message)) return jsonError(err.message, 409);
    throw err;
  }
  await logAudit("admin", `giveaway.winner_${b.action}`, String(id), { nonce: b.nonce, text: b.text.slice(0, 120), amount: b.amount });
  revalidatePath("/giveaways");
  revalidatePath("/admin/prizes");
  return json({ ok: true, info: await getWinnerInfo(id, b.nonce) });
}
