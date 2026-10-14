import { z } from "zod";
import { revalidatePath } from "next/cache";
import { accountPost, destinationOrThrow, zDestination } from "@/lib/accountApi";
import { claimAward } from "@/lib/prizes";
import { EventError } from "@/lib/events/common";
import { prizeOwner, saveDestination } from "@/lib/userAuth";

export const dynamic = "force-dynamic";

const Body = zDestination.extend({ id: z.number().int().positive(), note: z.string().trim().max(255).default(""), remember: z.boolean().default(true) });

export async function POST(request: Request) {
  return accountPost(request, Body, async (acc, b) => {
    const owner = prizeOwner(acc);
    if (!owner) throw new EventError("award_not_yours");
    const dest = destinationOrThrow(b);
    await claimAward(b.id, acc.id, owner, dest, b.note);
    if (b.remember) await saveDestination(acc.id, dest);
    revalidatePath("/admin/prizes");
  });
}
