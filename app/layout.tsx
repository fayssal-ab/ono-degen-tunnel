import type { Metadata, Viewport } from "next";
import { Unbounded, Inter_Tight, JetBrains_Mono, Bangers } from "next/font/google";
import { BRAND_NAME, STREAMER, SITE_URL } from "@/lib/constants";
import { ASSETS } from "@/lib/assets";
import "./globals.css";

const unbounded = Unbounded({
  subsets: ["latin"],
  variable: "--font-unbounded",
  display: "swap",
  weight: ["400", "500", "700", "800"],
});
// Bold display / "bang" titles.
const bangers = Bangers({
  subsets: ["latin"],
  variable: "--font-bangers",
  display: "swap",
  weight: "400",
});
const interTight = Inter_Tight({
  subsets: ["latin"],
  variable: "--font-inter-tight",
  display: "swap",
});
const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${BRAND_NAME} — ${STREAMER}'s rewards hub`,
    template: `%s · ${BRAND_NAME}`,
  },
  description:
    `Wager. Climb. Get paid. ${STREAMER}'s rewards tunnel — leaderboards, races, ` +
    `giveaways, free points games. Not a casino.`,
  applicationName: BRAND_NAME,
  openGraph: {
    title: BRAND_NAME,
    description: "Wager. Climb. Get paid.",
    url: SITE_URL,
    siteName: BRAND_NAME,
    type: "website",
    images: [ASSETS.brand.ogFallback],
  },
  twitter: { card: "summary_large_image", title: BRAND_NAME },
  robots: { index: true, follow: true },
  icons: { icon: ASSETS.brand.favicon },
};

export const viewport: Viewport = {
  themeColor: "#050507",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${unbounded.variable} ${interTight.variable} ${jetbrainsMono.variable} ${bangers.variable}`}
      suppressHydrationWarning
    >
      <body>{children}</body>
    </html>
  );
}
