import type { Metadata } from "next";
import "./globals.css";

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: "#4f46e5",
};

export const metadata: Metadata = {
  title: "ClaimBot — Parametric Insurance on GenLayer",
  description:
    "Automated parametric insurance powered by GenLayer Intelligent Contracts. Flood, crop, flight, and cargo coverage with instant AI-verified payouts.",
  keywords: ["insurance", "parametric", "blockchain", "GenLayer", "Nigeria", "flood", "defi"],
  openGraph: {
    title: "ClaimBot",
    description: "Parametric insurance that pays out automatically — no adjusters, no delays.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
        {/* Google Fonts — loaded with display=swap so layout never blocks */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,300..700;1,14..32,300..700&family=JetBrains+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen bg-ink-50 antialiased overflow-x-hidden">
        {children}
      </body>
    </html>
  );
}
