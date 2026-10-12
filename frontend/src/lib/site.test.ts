import { describe, expect, it } from "vitest";

import { formatArticleDate, mediaPath, openingHoursRows } from "./site";

describe("content helpers", () => {
  it("groups days with the same opening hours", () => {
    const weekdays = [0, 1, 2, 3, 4].map((weekday) => ({ weekday, start_time: "10:00", end_time: "19:00" }));
    const rows = openingHoursRows([...weekdays, { weekday: 5, start_time: "10:00", end_time: "17:00" }]);
    expect(rows).toEqual([
      { days: "Понеделник – Петък", time: "10:00 – 19:00" },
      { days: "Събота", time: "10:00 – 17:00" },
      { days: "Неделя", time: "почивен ден" },
    ]);
  });

  it("serves uploaded photos from the site's own /media path", () => {
    expect(mediaPath("http://localhost:8000/media/specialists/poli.jpg")).toBe("/media/specialists/poli.jpg");
    expect(mediaPath(null)).toBeNull();
    expect(mediaPath("https://evil.example/x.jpg")).toBeNull();
  });

  it("formats article dates in Bulgarian", () => {
    expect(formatArticleDate("2025-09-21T16:52:16+03:00")).toBe("21 септември 2025");
  });
});
