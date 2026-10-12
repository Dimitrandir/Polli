import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: { default: "Календар", template: "%s · SIS Esthetics" },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { themeColor: "#17a2b0" };

/** The salon team's side: light theme only and Studio24's teal, which the team is used to. */
export default function StaffLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <div className="staff-app">{children}</div>;
}
