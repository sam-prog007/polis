import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { BadgeToast } from "@/components/BadgeToast";
import { Boot } from "@/components/Boot";
import { BottomNav } from "@/components/BottomNav";
import { FloatingChrome } from "@/components/FloatingChrome";
import { Footer } from "@/components/Footer";
import { GlassFilter } from "@/components/GlassFilter";
import { LevelUp } from "@/components/LevelUp";
import { THEME_SCRIPT } from "@/lib/theme-script";
import "./globals.css";

const description = "polis : comprends la présidentielle 2027 en 5 minutes, fais grandir ta ville et défie tes potes. Neutre, gratuit, sans inscription. Aussi en anglais.";

export const metadata: Metadata = {
  // Absolute URLs for the link preview image (opengraph-image.tsx).
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"),
  title: "polis · Présidentielle 2027",
  description,
  applicationName: "polis",
  openGraph: { title: "polis · La présidentielle 2027 en 5 minutes", description, siteName: "polis", locale: "fr_FR", type: "website" },
  twitter: { card: "summary_large_image" },
  appleWebApp: { title: "polis", capable: true, statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#05060d" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // suppressHydrationWarning: the inline script below sets data-theme on <html> before React hydrates.
    <html lang="fr" className="h-full antialiased" suppressHydrationWarning>
      <head>
        {/* Applies the saved theme (Automatique / Clair / Sombre) before the first paint, so the page never flashes. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="flex min-h-full flex-col bg-paper text-ink">
        <GlassFilter />
        <Suspense fallback={null}>
          <FloatingChrome />
        </Suspense>
        {children}
        <Suspense fallback={null}>
          <Footer />
          <BottomNav />
        </Suspense>
        <LevelUp />
        <BadgeToast />
        <Boot />
      </body>
    </html>
  );
}
