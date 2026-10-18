import type { Metadata } from "next";

import { SettingsPage } from "@/components/staff/SettingsPage";

export const metadata: Metadata = { title: "Настройки" };

export default function StaffSettingsPageRoute() {
  return <SettingsPage />;
}
