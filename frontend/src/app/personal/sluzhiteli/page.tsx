import type { Metadata } from "next";

import { TeamPage } from "@/components/staff/TeamPage";

export const metadata: Metadata = { title: "Служители" };

export default function StaffTeamPageRoute() {
  return <TeamPage />;
}
