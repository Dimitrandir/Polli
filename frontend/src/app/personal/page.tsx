import { DayCalendar } from "@/components/staff/DayCalendar";

export default async function StaffCalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ d?: string; v?: string; s?: string }>;
}) {
  const { d, v, s } = await searchParams;
  return (
    <DayCalendar
      initialDate={d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : undefined}
      initialView={v === "week" ? "week" : "day"}
      initialSpecialist={s && /^\d+$/.test(s) ? Number(s) : null}
    />
  );
}
