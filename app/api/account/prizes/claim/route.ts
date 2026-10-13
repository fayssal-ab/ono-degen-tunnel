import { z } from "zod";
import { revalidatePath } from "next/cache";
import { accountPost, zPayout } from "@/lib/accountApi";
import { claimAward } from "@/lib/prizes";
import { EventError } from "@/lib/events/common";
import { kickOwner, savePayoutDefaults } from "@/lib/userAuth";

export const dynamic = "force-dynamic";

const Body = zPayout.extend({ id: z.number().int().positive(), note: z.string().trim().max(255).default(""), remember: z.boolean().default(true) });

export async function POST(request: Request) {
  return accountPost(request, Body, async (acc, b) => {
    const kick = kickOwner(acc);
    if (!kick) throw new EventError("award_not_yours");
    await claimAward(b.id, acc.id, kick, { method: b.method, username: b.username, note: b.note });
    if (b.remember) await savePayoutDefaults(acc.id, b.method, b.username);
    revalidatePath("/admin/prizes");
  });
}
