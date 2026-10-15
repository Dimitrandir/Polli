import "@fontsource-variable/manrope";
import "@fontsource/cormorant-garamond/500.css";
import "@fontsource/cormorant-garamond/600.css";
import "./globals.css";

import type { Metadata, Viewport } from "next";

import { THEME_INIT_SCRIPT } from "@/lib/theme";

export const metadata: Metadata = {
  title: { default: "SIS Esthetics Hair", template: "%s · SIS Esthetics Hair" },
  description: "Салон за красота SIS Esthetics Hair – колористика, трихология, маникюр. Запазете час онлайн.",
  applicationName: "SIS Esthetics",
  appleWebApp: { capable: true, title: "SIS Esthetics", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#faf6f1" },
    { media: "(prefers-color-scheme: dark)", color: "#15110f" },
  ],
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    // The theme script sets data-theme on <html> before React loads, hence suppressHydrationWarning.
    <html lang="bg" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
