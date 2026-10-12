// Layout maths for the staff day calendar (Studio24 style: a column per specialist, a block per visit).

import { SALON_TZ } from "./format";
import type { DaySchedule, StaffBooking, StaffItem } from "./staff-api";

/** Column colours when a specialist has none set in the admin, close to Studio24's. */
export const PALETTE = ["#7cb342", "#1565c0", "#ab1fa8", "#ef6c00", "#00897b", "#c62828", "#6d4c41", "#3949ab"];

export function specialistColor(color: string, index: number): string {
  return color || PALETTE[index % PALETTE.length];
}

const partsFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: SALON_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** Date key and minutes since midnight of an instant, in salon time. */
export function salonClock(instant: string | Date): { date: string; minutes: number } {
  const parts: Record<string, string> = {};
  for (const p of partsFormat.formatToParts(typeof instant === "string" ? new Date(instant) : instant)) {
    parts[p.type] = p.value;
  }
  return { date: `${parts.year}-${parts.month}-${parts.day}`, minutes: Number(parts.hour) * 60 + Number(parts.minute) };
}

/** Minutes since midnight of `day`, clamped to the day (for visits that cross midnight). */
export function minutesInDay(instant: string, day: string): number {
  const { date, minutes } = salonClock(instant);
  if (date < day) return 0;
  if (date > day) return 24 * 60;
  return minutes;
}

/** "10:15" from minutes since midnight. */
export function clockLabel(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** "2026-10-19T10:15:00" – salon time without an offset, which the API reads as Sofia time. */
export function salonDateTime(day: string, minutes: number): string {
  return `${day}T${clockLabel(minutes)}:00`;
}

/** Hours shown on the grid: from the earliest start to the latest end of the day, 09–19 when empty. */
export function visibleHours(schedule: DaySchedule): { from: number; to: number } {
  let from = Infinity;
  let to = -Infinity;
  const take = (start: string, end: string) => {
    from = Math.min(from, minutesInDay(start, schedule.date));
    to = Math.max(to, minutesInDay(end, schedule.date));
  };
  for (const s of schedule.specialists) for (const w of s.working) take(w.start, w.end);
  for (const b of schedule.bookings) for (const i of b.items) take(i.start, i.end);
  if (from === Infinity) return { from: 9, to: 19 };
  return { from: Math.floor(from / 60), to: Math.max(Math.ceil(to / 60), Math.floor(from / 60) + 1) };
}

export type Block = {
  key: string;
  booking: StaffBooking;
  specialist: number;
  start: number;
  end: number;
  services: string[];
  /** Side-by-side placement when blocks overlap in one column. */
  lane: number;
  lanes: number;
};

/**
 * One block per visit and specialist, like Studio24: services that follow each other at the same
 * specialist are merged ("Маникюр с лак, Педикюр"). A gap between them starts a new block.
 */
export function buildBlocks(schedule: DaySchedule): Map<number, Block[]> {
  const columns = new Map<number, Block[]>(schedule.specialists.map((s) => [s.id, []]));
  for (const booking of schedule.bookings) {
    const bySpecialist = new Map<number, StaffItem[]>();
    for (const item of booking.items) {
      if (!columns.has(item.specialist)) continue;
      bySpecialist.set(item.specialist, [...(bySpecialist.get(item.specialist) ?? []), item]);
    }
    for (const [specialist, items] of bySpecialist) {
      items.sort((a, b) => a.start.localeCompare(b.start));
      let current: Block | null = null;
      for (const item of items) {
        const start = minutesInDay(item.start, schedule.date);
        const end = minutesInDay(item.end, schedule.date);
        if (end <= start) continue; // not on this day
        if (current && start <= current.end) {
          current.end = Math.max(current.end, end);
          current.services.push(item.service_name);
        } else {
          current = {
            key: `${booking.id}-${item.id}`,
            booking,
            specialist,
            start,
            end,
            services: [item.service_name],
            lane: 0,
            lanes: 1,
          };
          columns.get(specialist)!.push(current);
        }
      }
    }
  }
  for (const blocks of columns.values()) assignLanes(blocks);
  return columns;
}

/** Put overlapping blocks next to each other (normally they never overlap, but the admin allows it). */
function assignLanes(blocks: Block[]) {
  blocks.sort((a, b) => a.start - b.start || b.end - a.end);
  let cluster: Block[] = [];
  let clusterEnd = -1;
  const close = () => {
    const lanes = Math.max(1, ...cluster.map((b) => b.lane + 1));
    for (const b of cluster) b.lanes = lanes;
    cluster = [];
  };
  for (const block of blocks) {
    if (block.start >= clusterEnd && cluster.length) close();
    const used = new Set(cluster.filter((b) => b.end > block.start).map((b) => b.lane));
    let lane = 0;
    while (used.has(lane)) lane++;
    block.lane = lane;
    cluster.push(block);
    clusterEnd = Math.max(clusterEnd, block.end);
  }
  if (cluster.length) close();
}

/** Round a tap on the grid down to the 15-minute line above it. */
export function snapMinutes(minutes: number, step = 15): number {
  return Math.max(0, Math.min(24 * 60 - step, Math.floor(minutes / step) * step));
}

const MONTHS_UPPER = ["ЯНУ", "ФЕВ", "МАР", "АПР", "МАЙ", "ЮНИ", "ЮЛИ", "АВГ", "СЕП", "ОКТ", "НОЕ", "ДЕК"];
const WEEKDAYS = ["неделя", "понеделник", "вторник", "сряда", "четвъртък", "петък", "събота"];

/** Header text like Studio24: { day: "26 МАЙ", weekday: "вторник" }. */
export function headerDate(key: string): { day: string; weekday: string } {
  const [y, m, d] = key.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return { day: `${d} ${MONTHS_UPPER[m - 1]}`, weekday: WEEKDAYS[date.getUTCDay()] };
}
