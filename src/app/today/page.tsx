import type { Metadata, Viewport } from "next";
import { TodayApp } from "@/components/today/today-app";
import "@/components/today/today.css";

export const metadata: Metadata = {
  title: "Today · memoRABLE",
  description: "Record what you worked on, learned and decided. Recall it instantly, see what to do next. Local-first, no model needed.",
};

export const viewport: Viewport = {
  themeColor: "#000000",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function TodayPage() {
  return <TodayApp />;
}
