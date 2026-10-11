import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { Inter_Tight, JetBrains_Mono } from "next/font/google";
import { BRAND_NAME, STREAMER, SITE_URL } from "@/lib/constants";
import { ASSETS } from "@/lib/assets";
import "./globals.css";

// Display + "bang" titles: Clash Display, self-hosted (the woff2 lives in the
// repo under app/fonts and is bundled at build — no runtime Google/CSS fetch).
const clash = localFont({
  src: "./fonts/ClashDisplay-Variable.woff2",
  variable: "--font-clash",
  display: "swap",
  weight: "200 700",
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
      className={`${clash.variable} ${interTight.variable} ${jetbrainsMono.variable}`}
      suppressHydrationWarning
    >
      <body>{children}</body>
    </html>
  );
}
