import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import localFont from "next/font/local";
import "./globals.css";

// Geist and Geist Mono (SIL OFL 1.1, see ./fonts/OFL-Geist.txt), self-hosted:
// no third-party font requests, works offline.
const geist = localFont({ src: "./fonts/Geist-Variable.woff2", variable: "--font-geist", weight: "100 900", display: "swap" });
// Instrument Serif (SIL OFL 1.1, see ./fonts/OFL-InstrumentSerif.txt): chapter headlines only.
const display = localFont({
  src: [
    { path: "./fonts/InstrumentSerif-Regular.woff", weight: "400", style: "normal" },
    { path: "./fonts/InstrumentSerif-Italic.woff", weight: "400", style: "italic" },
  ],
  variable: "--font-display",
  display: "swap",
});
const geistMono = localFont({ src: "./fonts/GeistMono-Variable.woff2", variable: "--font-geist-mono", weight: "100 900", display: "swap" });

export const metadata: Metadata = {
  title: "memoRABLE · Memory for engineering work",
  description:
    "Record what you worked on, learned and decided. Search it together with your GitHub issues, find the decision and the reason behind it, and turn documents into source-backed briefs. Runs in your browser.",
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: "#000000",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${geist.variable} ${geistMono.variable} ${display.variable}`}>
      <body>{children}</body>
    </html>
  );
}
