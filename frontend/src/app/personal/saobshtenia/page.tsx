import type { Metadata } from "next";

import { StaffInbox } from "@/components/staff/StaffInbox";

export const metadata: Metadata = { title: "Съобщения" };

export default function StaffInboxPage() {
  return <StaffInbox />;
}
