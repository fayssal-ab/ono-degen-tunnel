import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { BRAND_NAME, STREAMER, SITE_URL } from "@/lib/constants";
import { ASSETS } from "@/lib/assets";
import "./globals.css";

// ALL fonts are self-hosted (woff2 bundled in the repo under app/fonts and
// emitted at build). No next/font/google → the build never reaches out to
// Google Fonts, which keeps CI/Netlify builds deterministic and offline-safe.
const clash = localFont({
  src: "./fonts/ClashDisplay-Variable.woff2",
  variable: "--font-clash",
  display: "swap",
  weight: "200 700",
});
const interTight = localFont({
  variable: "--font-inter-tight",
  display: "swap",
  src: [
    { path: "./fonts/InterTight-400.woff2", weight: "400", style: "normal" },
    { path: "./fonts/InterTight-500.woff2", weight: "500", style: "normal" },
    { path: "./fonts/InterTight-600.woff2", weight: "600", style: "normal" },
    { path: "./fonts/InterTight-700.woff2", weight: "700", style: "normal" },
  ],
});
const jetbrainsMono = localFont({
  variable: "--font-jetbrains-mono",
  display: "swap",
  src: [{ path: "./fonts/JetBrainsMono-500.woff2", weight: "500", style: "normal" }],
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
    title: `${BRAND_NAME} — ${STREAMER}'s rewards hub`,
    description: "Wager. Climb. Get paid. Leaderboards, giveaways & VIP. Sign up with the code.",
    url: SITE_URL,
    siteName: BRAND_NAME,
    type: "website",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: BRAND_NAME }],
  },
  twitter: {
    card: "summary_large_image",
    title: `${BRAND_NAME} — ${STREAMER}'s rewards hub`,
    description: "Wager. Climb. Get paid. Sign up with the code.",
    images: ["/og.png"],
  },
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
