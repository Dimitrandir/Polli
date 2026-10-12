import type { Metadata } from "next";

import { LoginForm } from "@/components/staff/LoginForm";

export const metadata: Metadata = { title: "Вход за персонала" };

export default function StaffLoginPage() {
  return <LoginForm />;
}
