import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { DaySchedule, WeekSchedule } from "@/lib/staff-api";

import { DayCalendar } from "./DayCalendar";

const { replace } = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }) }));

const DAY = "2026-10-19";

const schedule: DaySchedule = {
  date: DAY,
  timezone: "Europe/Sofia",
  specialists: [
    {
      id: 1,
      name: "Невена Иванова",
      color: "",
      is_online_bookable: true,
      working: [{ start: `${DAY}T10:00:00+03:00`, end: `${DAY}T19:00:00+03:00` }],
      time_off: [],
    },
    {
      id: 2,
      name: "Фани Георгиева",
      color: "#ab1fa8",
      is_online_bookable: true,
      working: [{ start: `${DAY}T10:00:00+03:00`, end: `${DAY}T19:00:00+03:00` }],
      time_off: [{ id: 4, start: `${DAY}T14:00:00+03:00`, end: `${DAY}T15:00:00+03:00`, reason: "Почивка" }],
    },
  ],
  bookings: [
    {
      id: 5,
      status: "confirmed",
      source: "online",
      start: `${DAY}T10:00:00+03:00`,
      end: `${DAY}T11:00:00+03:00`,
      note: "",
      internal_note: "",
      client: {
        id: 3,
        name: "Димка Тошева",
        first_name: "Димка",
        last_name: "Тошева",
        phone: "+359888111222",
        email: "",
        notes: "",
        is_blocked: false,
      },
      items: [
        {
          id: 8,
          service: 1,
          service_name: "Дамско подстригване",
          specialist: 1,
          start: `${DAY}T10:00:00+03:00`,
          end: `${DAY}T11:00:00+03:00`,
          price: "30.00",
        },
      ],
      total_price: "30.00",
      created_at: "2026-10-01T10:00:00Z",
    },
  ],
};

const week: WeekSchedule = {
  start: DAY,
  timezone: "Europe/Sofia",
  specialist: 2,
  specialists: schedule.specialists.map(({ id, name, color, is_online_bookable }) => ({
    id,
    name,
    color,
    is_online_bookable,
  })),
  days: Array.from({ length: 7 }, (_, i) => ({
    date: `2026-10-${19 + i}`,
    working: i < 5 ? [{ start: `2026-10-${19 + i}T10:00:00+03:00`, end: `2026-10-${19 + i}T19:00:00+03:00` }] : [],
    time_off: [],
  })),
  bookings: [],
};

function json(body: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), { status }));
}

describe("DayCalendar", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    replace.mockReset();
    fetchMock.mockReset();
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url.startsWith("/api/staff/day")) return json(schedule);
      if (url.startsWith("/api/staff/week")) return json(week);
      if (url === "/api/staff/bookings/5/move") return json(schedule.bookings[0]);
      if (url === "/api/staff/time-off" && init?.method === "POST") return json({ id: 9 }, 201);
      if (url === "/api/staff/time-off/4" && init?.method === "DELETE") {
        return Promise.resolve(new Response(null, { status: 204 }));
      }
      if (url === "/api/staff/services") return json([]);
      if (url === "/api/staff/bookings/5" && init?.method === "PATCH") {
        return json({ ...schedule.bookings[0], status: "completed" });
      }
      return json({ detail: "not found" }, 404);
    });
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("shows a column per specialist with the visits, like Studio24", async () => {
    render(<DayCalendar initialDate={DAY} />);
    expect(screen.getByText("19 ОКТ")).toBeInTheDocument();
    expect(screen.getByText("понеделник")).toBeInTheDocument();
    expect(await screen.findByText("Димка Тошева")).toBeInTheDocument();
    expect(screen.getByText("Невена Иванова")).toBeInTheDocument();
    expect(screen.getByText("Фани Георгиева")).toHaveStyle({ background: "#ab1fa8" });
    expect(screen.getByText("10:00 - 11:00")).toBeInTheDocument();
    expect(screen.getByText("Дамско подстригване")).toBeInTheDocument();
    expect(screen.getByText("Почивка")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(`/api/staff/day?date=${DAY}`, expect.anything());
  });

  it("opens a visit and marks it as done", async () => {
    const user = userEvent.setup();
    render(<DayCalendar initialDate={DAY} />);
    await user.click(await screen.findByText("Димка Тошева"));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("+359888111222")).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: /Изпълнена/ }));
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/staff/bookings/5",
      expect.objectContaining({ method: "PATCH", body: JSON.stringify({ status: "completed" }) }),
    );
  });

  it("moves to the next day", async () => {
    const user = userEvent.setup();
    render(<DayCalendar initialDate={DAY} />);
    await screen.findByText("Димка Тошева");
    await user.click(screen.getByRole("button", { name: "Следващ ден" }));
    expect(screen.getByText("20 ОКТ")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith("/api/staff/day?date=2026-10-20", expect.anything());
  });

  it("sends the team to the login page when the session has expired", async () => {
    fetchMock.mockImplementation(() => json({ detail: "Нужен е вход" }, 403));
    render(<DayCalendar initialDate={DAY} />);
    await vi.waitFor(() => expect(replace).toHaveBeenCalledWith("/personal/vhod"));
  });

  it("opens the new booking form with the + button", async () => {
    const user = userEvent.setup();
    render(<DayCalendar initialDate={DAY} />);
    await screen.findByText("Димка Тошева");
    await user.click(screen.getByRole("button", { name: "Нов час" }));
    expect(within(screen.getByRole("dialog")).getByText("Специалист")).toBeInTheDocument();
  });

  it("blocks time from the + form", async () => {
    const user = userEvent.setup();
    render(<DayCalendar initialDate={DAY} />);
    await screen.findByText("Димка Тошева");
    await user.click(screen.getByRole("button", { name: "Нов час" }));
    const dialog = screen.getByRole("dialog");
    await user.click(within(dialog).getByRole("tab", { name: "Блокирай време" }));
    await user.click(within(dialog).getByRole("button", { name: "Почивка" }));
    await user.click(within(dialog).getByRole("button", { name: /Запази/ }));
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/staff/time-off",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          specialist: 1,
          start: `${DAY}T10:00:00`,
          end: `${DAY}T11:00:00`,
          reason: "Почивка",
        }),
      }),
    );
  });

  it("removes blocked time", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const user = userEvent.setup();
    render(<DayCalendar initialDate={DAY} />);
    await user.click(await screen.findByRole("button", { name: "Почивка" }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: /Премахни/ }));
    expect(fetchMock).toHaveBeenCalledWith("/api/staff/time-off/4", expect.objectContaining({ method: "DELETE" }));
  });

  it("drags a visit to another specialist and time", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    // jsdom has no layout: the first specialist's column spans x 52–200, the second 200–350.
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      const id = this.dataset.testid;
      const [left, right] = id === "column-s1" ? [52, 200] : id === "column-s2" ? [200, 350] : [0, 1000];
      return { left, right, top: 0, bottom: 1000, width: right - left, height: 1000, x: left, y: 0, toJSON: () => ({}) };
    });
    render(<DayCalendar initialDate={DAY} />);
    const block = (await screen.findByText("Димка Тошева")).closest("button")!;

    fireEvent.pointerDown(block, { pointerType: "mouse", button: 0, clientX: 100, clientY: 10 });
    fireEvent.pointerMove(window, { pointerType: "mouse", clientX: 260, clientY: 10 + 60 * 1.4 });
    expect(screen.getByText("11:00 - 12:00")).toBeInTheDocument(); // where it will land
    fireEvent.pointerUp(window, { pointerType: "mouse", clientX: 260, clientY: 10 + 60 * 1.4 });

    await vi.waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/staff/bookings/5/move",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ item: 8, start: `${DAY}T11:00:00`, specialist: 2 }),
        }),
      ),
    );
  });

  it("shows one specialist's week", async () => {
    const user = userEvent.setup();
    render(<DayCalendar initialDate="2026-10-21" initialView="week" />);
    expect(await screen.findByText("пн 19")).toBeInTheDocument();
    expect(screen.getByText("нд 25")).toBeInTheDocument();
    expect(screen.getByText("19 – 25 ОКТ")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith("/api/staff/week?date=2026-10-19", expect.anything());
    expect(screen.getByRole("button", { name: "Фани Георгиева" })).toHaveAttribute("aria-pressed", "true");

    await user.click(screen.getByRole("button", { name: "Невена Иванова" }));
    expect(fetchMock).toHaveBeenCalledWith("/api/staff/week?date=2026-10-19&specialist=1", expect.anything());

    await user.click(await screen.findByText("ср 21"));
    expect(screen.getByText("21 ОКТ")).toBeInTheDocument();
  });
});
