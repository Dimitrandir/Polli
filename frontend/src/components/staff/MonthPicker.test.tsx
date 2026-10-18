import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { addBreak } from "./HoursEditor";
import { MonthPicker, monthGrid } from "./MonthPicker";

describe("monthGrid", () => {
  it("starts on Monday and covers the whole month", () => {
    const days = monthGrid("2026-10-01");
    expect(days[0]).toBe("2026-09-28");
    expect(days).toContain("2026-10-31");
    expect(days.length % 7).toBe(0);
    expect(days[days.length - 1]).toBe("2026-11-01");
  });
});

describe("addBreak", () => {
  it("splits the day with an hour in the middle", () => {
    expect(addBreak([{ weekday: 0, start: "09:00", end: "18:00" }])).toEqual([
      { weekday: 0, start: "09:00", end: "13:00" },
      { weekday: 0, start: "14:00", end: "18:00" },
    ]);
  });
});

describe("MonthPicker", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("shows a dot per working specialist, bigger when busier, and picks a day", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              month: "2026-10-01",
              specialists: [
                { id: 1, name: "Невена", color: "#7cb342", is_online_bookable: true },
                { id: 2, name: "Фани", color: "#ab1fa8", is_online_bookable: true },
              ],
              days: { "2026-10-16": { "1": 1, "2": 0.2 }, "2026-10-17": { "2": 0 } },
            }),
          ),
        ),
      ),
    );
    const onPick = vi.fn();
    render(<MonthPicker value="2026-10-16" onPick={onPick} onClose={() => null} />);
    expect(screen.getByText("октомври 2026")).toBeInTheDocument();
    const full = await screen.findByTitle("Невена: 100%");
    expect(full).toHaveStyle({ width: "10px" });
    expect(screen.getByTitle("Фани: 20%")).toHaveStyle({ width: "4px" });
    expect(screen.queryByTitle("Невена: 0%")).not.toBeInTheDocument();

    await userEvent.setup().click(screen.getByRole("button", { name: "2026-10-22" }));
    expect(onPick).toHaveBeenCalledWith("2026-10-22");
  });
});
