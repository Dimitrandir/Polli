import type { Metadata } from "next";

import { ClientsPage } from "@/components/staff/ClientsPage";

export const metadata: Metadata = { title: "Клиенти" };

export default function StaffClientsPageRoute() {
  return <ClientsPage />;
}
