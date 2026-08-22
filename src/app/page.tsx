import type { Metadata, Viewport } from "next";
import { LandingPage } from "@/components/landing/landing-page";

export const metadata: Metadata = {
  title: "Goalmaxxing - Short-term execution, long-term goals",
  description:
    "Goalmaxxing connects daily execution to short-term and long-term goals with planning, momentum tracking, and accountability.",
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
