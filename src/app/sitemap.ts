import type { MetadataRoute } from "next";

const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim() || "https://goalmaxxing.xyz";
const baseUrl = appUrl.replace(/\/+$/, "");

const marketingRoutes = ["/", "/login", "/signup", "/privacy", "/terms"];

export default function sitemap(): MetadataRoute.Sitemap {
  return marketingRoutes.map((route) => ({
    url: `${baseUrl}${route}`,
    lastModified: new Date(),
    changeFrequency: route === "/" ? "weekly" : "monthly",
    priority: route === "/" ? 1 : 0.6,
  }));
}
