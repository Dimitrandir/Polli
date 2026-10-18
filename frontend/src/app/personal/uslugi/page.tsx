import type { Metadata } from "next";

import { ServicesPage } from "@/components/staff/ServicesPage";

export const metadata: Metadata = { title: "Услуги" };

export default function StaffServicesPageRoute() {
  return <ServicesPage />;
}
