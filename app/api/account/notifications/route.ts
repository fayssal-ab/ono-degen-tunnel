import { z } from "zod";
import { accountPost } from "@/lib/accountApi";
import { markNotificationsSeen } from "@/lib/userAuth";

export const dynamic = "force-dynamic";

// The bell was opened: everything up to now is read.
export async function POST(request: Request) {
  return accountPost(request, z.object({ seen: z.literal(true) }), (acc) => markNotificationsSeen(acc.id));
}
