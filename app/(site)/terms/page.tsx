import type { Metadata } from "next";
import { BRAND_NAME, STREAMER } from "@/lib/constants";
import { LegalDoc } from "@/components/content/LegalDoc";

export const metadata: Metadata = { title: "Terms", description: `Terms of use for ${BRAND_NAME}.` };

export default function TermsPage() {
  return (
    <LegalDoc
      kicker="Legal"
      title="Terms of Use"
      lead={`The ground rules for using ${BRAND_NAME}.`}
      updated="2026"
      sections={[
        {
          heading: "What this site is",
          paragraphs: [
            `${BRAND_NAME} is a fan and rewards hub for the streamer ${STREAMER}. It is not a casino, does not accept deposits, and does not operate any real-money gambling. All competition on this site is based on wagering done at independent third-party casinos.`,
            "By using the site you confirm you are of legal gambling age in your jurisdiction (18+ minimum) and that online gambling is legal where you live.",
          ],
        },
        {
          heading: "Partner casinos",
          paragraphs: [
            "Links to partner casinos are affiliate links. The streamer may earn commission when you sign up and play under the code. The casinos are operated by third parties under their own terms — we are not responsible for their services, payouts, bonuses or account decisions.",
          ],
        },
        {
          heading: "Prizes & promotions",
          paragraphs: [
            "Leaderboards, races, tournaments, challenges and giveaways are promotions run by the streamer. Prize pools, eligibility and payout timing are at the streamer's discretion and may change. Frozen results are final once a period closes.",
            "We may disqualify anyone for fraud, multi-accounting, collusion or abuse.",
          ],
        },
        {
          heading: "No warranty",
          paragraphs: [
            "The site is provided “as is”. Wager data comes from third-party feeds and may be delayed or occasionally inaccurate. We are not liable for losses arising from use of the site or from gambling at any casino.",
          ],
        },
        {
          heading: "Contact",
          paragraphs: ["Questions about these terms? Reach a moderator in the Discord."],
        },
      ]}
    />
  );
}
