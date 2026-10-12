import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { DaySchedule } from "@/lib/staff-api";

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
      time_off: [{ start: `${DAY}T14:00:00+03:00`, end: `${DAY}T15:00:00+03:00`, reason: "Почивка" }],
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
});
