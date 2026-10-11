import { describe, expect, it } from "vitest";

import {
  addDays,
  formatDuration,
  formatLongDate,
  formatPrice,
  formatTime,
  icsStamp,
  salonHour,
  startOfWeek,
  todayKey,
  weekdayParts,
} from "./format";

describe("format", () => {
  it("formats EUR prices the Bulgarian way", () => {
    expect(formatPrice("28.12").replace(/\s/g, " ")).toBe("28,12 €");
  });

  it("formats durations", () => {
    expect(formatDuration(45)).toBe("45 мин");
    expect(formatDuration(60)).toBe("1 ч");
    expect(formatDuration(90)).toBe("1 ч 30 мин");
  });

  it("shows times in salon time even on a device in New York", () => {
    expect(formatTime("2026-10-19T06:00:00Z")).toBe("09:00");
    expect(salonHour("2026-10-19T06:00:00Z")).toBe(9);
  });

  it("capitalises only the first letter of a long date", () => {
    expect(formatLongDate("2026-10-19")).toBe("Понеделник, 19 октомври");
  });

  it("does calendar maths on date keys", () => {
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(startOfWeek("2026-10-18")).toBe("2026-10-12"); // Sunday -> Monday
    expect(startOfWeek("2026-10-19")).toBe("2026-10-19");
    expect(weekdayParts("2026-10-19")).toEqual({ weekday: "пн", day: "19", month: "окт" });
  });

  it("knows today's date in Sofia", () => {
    // 23:30 in New York on the 18th is already the 19th in Sofia.
    expect(todayKey(new Date("2026-10-19T03:30:00Z"))).toBe("2026-10-19");
  });

  it("writes UTC timestamps for calendar files", () => {
    expect(icsStamp("2026-10-19T09:00:00+03:00")).toBe("20261019T060000Z");
  });
});
