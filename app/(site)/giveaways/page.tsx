import { permanentRedirect } from "next/navigation";

// The public giveaways page was folded into /prizes (winners + what they won).
// Giveaways themselves still run from the admin dashboard and the stream overlay.
export default function GiveawaysPage() {
  permanentRedirect("/prizes");
}
