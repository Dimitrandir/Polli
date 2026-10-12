import { describe, expect, it } from "vitest";

import {
  buildBlocks,
  clockLabel,
  headerDate,
  minutesInDay,
  salonClock,
  salonDateTime,
  snapMinutes,
  specialistColor,
  visibleHours,
} from "./calendar";
import type { DaySchedule, StaffBooking, StaffItem } from "./staff-api";

const DAY = "2026-10-19";

function item(id: number, specialist: number, start: string, end: string, name = "Услуга"): StaffItem {
  return { id, service: id, service_name: name, specialist, start, end, price: "10.00" };
}

function booking(id: number, items: StaffItem[]): StaffBooking {
  return {
    id,
    status: "confirmed",
    source: "salon",
    start: items[0].start,
    end: items[items.length - 1].end,
    note: "",
    internal_note: "",
    client: {
      id: 1,
      name: "Мария Иванова",
      first_name: "Мария",
      last_name: "Иванова",
      phone: "+359888123456",
      email: "",
      notes: "",
      is_blocked: false,
    },
    items,
    total_price: "10.00",
    created_at: "2026-10-01T10:00:00+03:00",
  };
}

function schedule(bookings: StaffBooking[], working = true): DaySchedule {
  const hours = working ? [{ start: `${DAY}T09:30:00+03:00`, end: `${DAY}T18:00:00+03:00` }] : [];
  return {
    date: DAY,
    timezone: "Europe/Sofia",
    specialists: [
      { id: 1, name: "Поли", color: "", is_online_bookable: true, working: hours, time_off: [] },
      { id: 2, name: "Надя", color: "#123456", is_online_bookable: true, working: hours, time_off: [] },
    ],
    bookings,
  };
}

describe("calendar", () => {
  it("reads times in salon time, whatever the device time zone", () => {
    expect(salonClock("2026-10-19T07:15:00Z")).toEqual({ date: DAY, minutes: 10 * 60 + 15 });
    expect(minutesInDay("2026-10-18T23:00:00+03:00", DAY)).toBe(0);
    expect(minutesInDay("2026-10-20T01:00:00+03:00", DAY)).toBe(24 * 60);
  });

  it("formats and snaps clock times", () => {
    expect(clockLabel(9 * 60 + 5)).toBe("09:05");
    expect(salonDateTime(DAY, 10 * 60 + 15)).toBe("2026-10-19T10:15:00");
    expect(snapMinutes(10 * 60 + 14)).toBe(10 * 60);
    expect(snapMinutes(-5)).toBe(0);
  });

  it("uses the admin colour or falls back to the palette", () => {
    expect(specialistColor("#123456", 0)).toBe("#123456");
    expect(specialistColor("", 1)).toBe("#1565c0");
  });

  it("shows the hours from the first start to the last end", () => {
    expect(visibleHours(schedule([]))).toEqual({ from: 9, to: 18 });
    expect(visibleHours(schedule([], false))).toEqual({ from: 9, to: 19 });
    const late = booking(1, [item(1, 1, `${DAY}T18:30:00+03:00`, `${DAY}T19:10:00+03:00`)]);
    expect(visibleHours(schedule([late]))).toEqual({ from: 9, to: 20 });
  });

  it("merges back-to-back services of one visit into one block per specialist", () => {
    const visit = booking(1, [
      item(1, 1, `${DAY}T10:00:00+03:00`, `${DAY}T11:00:00+03:00`, "Подстригване"),
      item(2, 1, `${DAY}T11:00:00+03:00`, `${DAY}T12:30:00+03:00`, "Боядисване"),
      item(3, 2, `${DAY}T10:00:00+03:00`, `${DAY}T11:30:00+03:00`, "Маникюр"),
    ]);
    const columns = buildBlocks(schedule([visit]));
    const poli = columns.get(1)!;
    expect(poli).toHaveLength(1);
    expect(poli[0]).toMatchObject({ start: 600, end: 750, services: ["Подстригване", "Боядисване"] });
    expect(columns.get(2)![0]).toMatchObject({ start: 600, end: 690, services: ["Маникюр"] });
  });

  it("puts overlapping blocks side by side", () => {
    const a = booking(1, [item(1, 1, `${DAY}T10:00:00+03:00`, `${DAY}T11:00:00+03:00`)]);
    const b = booking(2, [item(2, 1, `${DAY}T10:30:00+03:00`, `${DAY}T11:30:00+03:00`)]);
    const c = booking(3, [item(3, 1, `${DAY}T12:00:00+03:00`, `${DAY}T13:00:00+03:00`)]);
    const blocks = buildBlocks(schedule([a, b, c])).get(1)!;
    expect(blocks.map((x) => [x.lane, x.lanes])).toEqual([
      [0, 2],
      [1, 2],
      [0, 1],
    ]);
  });

  it("writes the header date like Studio24", () => {
    expect(headerDate("2026-05-26")).toEqual({ day: "26 МАЙ", weekday: "вторник" });
  });
});
