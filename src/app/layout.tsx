import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "sonner";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const metadataBase = (() => {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (!configured) {
    return undefined;
  }
  try {
    const url = new URL(configured);
    return new URL(url.origin);
  } catch {
    return undefined;
  }
})();

export const metadata: Metadata = {
  title: "Goalmaxxing",
  description: "Personal goal tracking with insights and social accountability.",
  applicationName: "Goalmaxxing",
  metadataBase,
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Goalmaxxing",
  },
  icons: {
    icon: "/cadence-icon.svg",
    apple: "/cadence-icon.svg",
  },
};

export const viewport: Viewport = {
  themeColor: "#2563eb",
  viewportFit: "cover",
  maximumScale: 1,
  minimumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-background text-foreground flex flex-col">
        {children}
        <Toaster position="bottom-right" richColors />
      </body>
    </html>
  );
}
