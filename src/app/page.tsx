import type { Metadata, Viewport } from "next";
import { LandingPage } from "@/components/landing/landing-page";

export const metadata: Metadata = {
  title: "Goalmaxxing - Short-term and long-term goal planning",
  description:
    "Goalmaxxing helps you achieve short-term wins and long-term outcomes with planning, measurable progress tracking, and accountability.",
};

export const viewport: Viewport = {
  maximumScale: 5,
  minimumScale: 1,
  userScalable: true,
  viewportFit: "cover",
  themeColor: "#2563eb",
};

export default function MarketingLandingPage() {
  return <LandingPage />;
}
