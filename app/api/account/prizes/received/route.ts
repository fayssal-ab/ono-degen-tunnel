import { z } from "zod";
import { revalidatePath } from "next/cache";
import { accountPost } from "@/lib/accountApi";
import { confirmReceived } from "@/lib/prizes";
import { EventError } from "@/lib/events/common";
import { prizeOwner } from "@/lib/userAuth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return accountPost(request, z.object({ id: z.number().int().positive() }), async (acc, b) => {
    const owner = prizeOwner(acc);
    if (!owner) throw new EventError("award_not_yours");
    await confirmReceived(b.id, owner);
    revalidatePath("/prizes");
    revalidatePath("/admin/prizes");
  });
}
