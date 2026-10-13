import { accountPost, zPayout } from "@/lib/accountApi";
import { savePayoutDefaults } from "@/lib/userAuth";

export const dynamic = "force-dynamic";

// Default payout destination (pre-fills prize claims).
export async function POST(request: Request) {
  return accountPost(request, zPayout, (acc, b) => savePayoutDefaults(acc.id, b.method, b.username));
}
