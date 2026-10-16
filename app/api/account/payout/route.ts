import { z } from "zod";
import { accountPost, destinationOrThrow, zDestination } from "@/lib/accountApi";
import { clearDestination, saveDestination, setPreferredDestination } from "@/lib/userAuth";

export const dynamic = "force-dynamic";

// Saved payout destinations (Stake, USDC wallet): each one is saved,
// removed or made preferred on its own. They pre-fill prize claims on the site
// and in the Discord ticket.
const Method = z.enum(["stake", "usdc"]);
const Body = z.discriminatedUnion("action", [
  zDestination.extend({ action: z.literal("save") }),
  z.object({ action: z.literal("clear"), method: Method }),
  z.object({ action: z.literal("prefer"), method: Method }),
]);

export async function POST(request: Request) {
  return accountPost(request, Body, async (acc, b) => {
    if (b.action === "save") await saveDestination(acc.id, destinationOrThrow(b));
    else if (b.action === "clear") await clearDestination(acc.id, b.method);
    else await setPreferredDestination(acc.id, b.method);
  });
}
