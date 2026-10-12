import { NextResponse } from "next/server";
import { getFeaturedKo, getKoById, getKoState } from "@/lib/knockout";

// Public live state of the featured knockout tournament (OBS overlay, public
// page, admin dashboard all poll this). Contains only public chat handles and
// slot info — no Kick user ids, nothing admin-only.
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const idParam = Number(new URL(request.url).searchParams.get("id"));
  try {
    const t = Number.isInteger(idParam) && idParam > 0 ? await getKoById(idParam) : await getFeaturedKo();
    if (!t || t.status === "cancelled") return NextResponse.json({ ok: true, state: null }, { headers: { "Cache-Control": "no-store" } });
    return NextResponse.json({ ok: true, state: await getKoState(t) }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ ok: false, error: "unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
