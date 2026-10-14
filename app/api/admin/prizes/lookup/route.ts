import { isAdminRequest } from "@/lib/admin";
import { json, jsonError } from "@/lib/http";
import { verifyWinner } from "@/lib/winnerLookup";

// Live check for Admin → Prizes → "Add a prize": is this a real Kick / Discord account?
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!isAdminRequest(request)) return jsonError("unauthorized", 401);
  const url = new URL(request.url);
  const platform = url.searchParams.get("platform");
  const q = (url.searchParams.get("q") ?? "").slice(0, 60);
  if (platform !== "kick" && platform !== "discord") return jsonError("invalid_input", 400);
  try {
    return json({ winner: await verifyWinner(platform, q) });
  } catch (err) {
    console.error("winner lookup failed", err);
    return jsonError("unexpected", 500);
  }
}
