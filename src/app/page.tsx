import type { Metadata, Viewport } from "next";
import { LandingPage } from "@/components/landing/landing-page";

export const metadata: Metadata = {
  title: "Goalmaxxing - Plan goals and build consistency",
  description:
    "Goalmaxxing helps you plan goals, complete daily checklists, and track momentum with insights and accountability.",
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
