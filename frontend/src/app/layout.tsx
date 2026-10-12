import "@fontsource-variable/manrope";
import "@fontsource/cormorant-garamond/500.css";
import "@fontsource/cormorant-garamond/600.css";
import "./globals.css";

import type { Metadata, Viewport } from "next";

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
    <html lang="bg">
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
