import type { MetadataRoute } from "next";

const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim() || "https://goalmaxxing.xyz";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/login", "/signup", "/privacy", "/terms"],
        disallow: ["/app"],
      },
    ],
    sitemap: `${appUrl.replace(/\/+$/, "")}/sitemap.xml`,
  };
}
