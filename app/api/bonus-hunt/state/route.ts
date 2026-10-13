import { NextResponse } from "next/server";
import { getFeaturedHuntState } from "@/lib/bonusHunt";

// Public live state of the current bonus hunt (OBS overlay polls this).
// Slots, bets and payouts only — nothing private.
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json({ ok: true, state: await getFeaturedHuntState() }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ ok: false, error: "unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
