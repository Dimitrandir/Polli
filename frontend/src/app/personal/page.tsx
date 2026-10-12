import { DayCalendar } from "@/components/staff/DayCalendar";

export default async function StaffCalendarPage({ searchParams }: { searchParams: Promise<{ d?: string }> }) {
  const { d } = await searchParams;
  return <DayCalendar initialDate={d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : undefined} />;
}
