import { NextResponse } from "next/server";
import { currentAccountId, getAccount, prizeOwner } from "@/lib/userAuth";
import { countOwnedActions, listPrizeNotifications, type PrizeNotification } from "@/lib/prizes";

export const dynamic = "force-dynamic";

// Signed-in viewer for the top bar (fetched client-side so public pages stay
// cacheable): profile, prize actions badge and the prize notification feed.
export async function GET() {
  const headers = { "Cache-Control": "private, no-store" };
  try {
    const id = await currentAccountId();
    const acc = id != null ? await getAccount(id) : null;
    if (!acc) return NextResponse.json({ user: null }, { headers });
    const owner = prizeOwner(acc);
    const empty = { items: [] as PrizeNotification[], unread: 0 };
    const [actions, notifications] = owner
      ? await Promise.all([countOwnedActions(owner).catch(() => 0), listPrizeNotifications(owner, acc.notif_seen_at).catch(() => empty)])
      : [0, empty];
    const user = { name: acc.display_name, avatar: acc.avatar, providers: acc.identities.map((i) => i.provider), actions, notifications };
    return NextResponse.json({ user }, { headers });
  } catch {
    return NextResponse.json({ user: null }, { headers });
  }
}
