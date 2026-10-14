import { z } from "zod";
import { revalidatePath } from "next/cache";
import { isAdminRequest } from "@/lib/admin";
import { json, jsonError, isSameOrigin } from "@/lib/http";
import { confirmWinner, getWinnerInfo, markNoShow } from "@/lib/giveaways";
import { logAudit } from "@/lib/audit";

// The drawn winner's 15 s chat window. GET: their site links (Kick / Discord)
// + the recorded prize. POST confirm: they answered in chat (or the admin
// accepts them) → prize recorded. POST no_show: silent → no prize, reroll.
export const dynamic = "force-dynamic";

const Body = z.object({
  action: z.enum(["confirm", "no_show"]),
  nonce: z.number().int().min(0),
  text: z.string().max(500).default(""),
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
    else await markNoShow(id, b.nonce);
  } catch (err) {
    if (err instanceof Error && (err.message === "winner_already_decided" || err.message === "winner_not_found")) return jsonError(err.message, 409);
    throw err;
  }
  await logAudit("admin", b.action === "confirm" ? "giveaway.winner_confirmed" : "giveaway.winner_no_show", String(id), { nonce: b.nonce, text: b.text.slice(0, 120) });
  revalidatePath("/giveaways");
  revalidatePath("/admin/prizes");
  return json({ ok: true, info: await getWinnerInfo(id, b.nonce) });
}
