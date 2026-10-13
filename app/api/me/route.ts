import { NextResponse } from "next/server";
import { currentAccountId, getAccount, kickOwner } from "@/lib/userAuth";
import { countOwnedActions } from "@/lib/prizes";

export const dynamic = "force-dynamic";

// Signed-in viewer for the top bar (fetched client-side so public pages stay cacheable).
export async function GET() {
  try {
    const id = await currentAccountId();
    const acc = id != null ? await getAccount(id) : null;
    const kick = acc ? kickOwner(acc) : null;
    const actions = kick ? await countOwnedActions(kick).catch(() => 0) : 0;
    const user = acc ? { name: acc.display_name, avatar: acc.avatar, providers: acc.identities.map((i) => i.provider), actions } : null;
    return NextResponse.json({ user }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ user: null }, { headers: { "Cache-Control": "private, no-store" } });
  }
}
