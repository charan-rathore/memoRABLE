import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "memoRABLE · Turn information into memory",
  description:
    "Bring JSON, notes or Markdown. memoRABLE understands them locally and remembers them as six source-linked Memory Blocks, published as a Web page, Email or Document.",
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: "#FAF9F5",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
