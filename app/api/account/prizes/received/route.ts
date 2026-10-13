import { z } from "zod";
import { revalidatePath } from "next/cache";
import { accountPost } from "@/lib/accountApi";
import { confirmReceived } from "@/lib/prizes";
import { EventError } from "@/lib/events/common";
import { kickOwner } from "@/lib/userAuth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return accountPost(request, z.object({ id: z.number().int().positive() }), async (acc, b) => {
    const kick = kickOwner(acc);
    if (!kick) throw new EventError("award_not_yours");
    await confirmReceived(b.id, kick);
    revalidatePath("/prizes");
    revalidatePath("/admin/prizes");
  });
}
