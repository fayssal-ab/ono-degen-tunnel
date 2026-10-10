import type { Metadata } from "next";
import { BRAND_NAME } from "@/lib/constants";
import { LegalDoc } from "@/components/content/LegalDoc";

export const metadata: Metadata = { title: "Privacy", description: `Privacy policy for ${BRAND_NAME}.` };

export default function PrivacyPage() {
  return (
    <LegalDoc
      kicker="Legal"
      title="Privacy Policy"
      lead="What data we touch and what we don't."
      updated="2026"
      sections={[
        {
          heading: "What we show",
          paragraphs: [
            "Leaderboard and race standings display casino usernames in masked form (e.g. jo****oe). Full usernames are never sent to your browser — masking happens on our server before any data leaves it.",
          ],
        },
        {
          heading: "What we collect",
          paragraphs: [
            "The public site has no user accounts and sets no tracking cookies. We may keep basic, aggregate server logs (for rate-limiting and abuse prevention) and a short-lived record of IPs for those limits.",
            "If you submit your casino username to be verified for prizes, we store it to attribute wagers and arrange payouts, and we do not display it unmasked publicly.",
          ],
        },
        {
          heading: "Third parties",
          paragraphs: [
            "Wager data comes from partner-casino affiliate feeds. Live stream and chat are embedded from Kick. Those services have their own privacy policies; using them is subject to their terms.",
          ],
        },
        {
          heading: "Your choices",
          paragraphs: [
            "To have a submitted casino username removed, message a moderator in Discord. Because the site has no accounts, there is otherwise little personal data to request or delete.",
          ],
        },
      ]}
    />
  );
}
