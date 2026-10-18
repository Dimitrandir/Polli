import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { categories } from "@/test/fixtures";

import { BookingWizard } from "./BookingWizard";

const availability = {
  timezone: "Europe/Sofia",
  days: Array.from({ length: 7 }, (_, i) => ({
    date: `2026-10-${19 + i}`,
    slots:
      i === 0
        ? [
            {
              start: "2026-10-19T09:00:00+03:00",
              end: "2026-10-19T10:30:00+03:00",
              total_price: "80.00",
              items: [
                {
                  service: 1,
                  service_name: "Боядисване на корени",
                  specialist: 1,
                  specialist_name: "Поли",
                  start: "2026-10-19T09:00:00+03:00",
                  end: "2026-10-19T10:30:00+03:00",
                  price: "80.00",
                },
              ],
            },
          ]
        : [],
  })),
};

const booking = {
  id: 7,
  status: "confirmed",
  start: "2026-10-19T09:00:00+03:00",
  end: "2026-10-19T10:30:00+03:00",
  note: "",
  items: availability.days[0].slots[0].items,
  total_price: "80.00",
  can_cancel: true,
  created_at: "2026-10-15T10:00:00Z",
  cancel_token: "abc",
};

function json(body: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), { status }));
}

describe("BookingWizard", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-10-18T10:00:00Z") });
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("books a service from start to finish", async () => {
    const user = userEvent.setup();
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url === "/api/availability") return json(availability);
      if (url === "/api/bookings" && init?.method === "POST") return json(booking, 201);
      throw new Error(`unexpected ${url}`);
    });

    render(<BookingWizard initialCategories={categories} />);

    // The specialist comes first, then their services with their own prices.
    expect(screen.queryByRole("button", { name: /Боядисване на корени/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole("radio", { name: /Поли/ }));
    expect(screen.getByRole("button", { name: /Боядисване на корени/ })).toHaveTextContent("80,00");
    await user.click(screen.getByRole("button", { name: /Боядисване на корени/ }));
    await user.click(screen.getAllByRole("button", { name: /Продължи/ })[0]);

    // The current week (12–18 Oct) is the first request; the next week has the slot.
    await user.click(await screen.findByRole("button", { name: "09:00" }));
    await user.click(screen.getAllByRole("button", { name: /Към данните/ })[0]);

    await user.type(await screen.findByLabelText(/^Име \*$/), "Петя");
    await user.type(screen.getByLabelText(/^Телефон \*$/), "0877000111");
    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: "Потвърди резервацията" }));

    expect(await screen.findByText("Очакваме ви!")).toBeInTheDocument();
    const [, init] = fetchMock.mock.calls.find(([url]) => url === "/api/bookings")!;
    expect(JSON.parse(init.body)).toMatchObject({
      start: "2026-10-19T09:00:00+03:00",
      parallel: false,
      items: [{ service: 1, specialist: 1 }],
      client: { first_name: "Петя", phone: "0877000111" },
      consent: true,
    });
    expect(within(screen.getByText("Потвърдена").closest("div")!.parentElement!).getByText(/Поли/)).toBeInTheDocument();
  });

  it("returns to the calendar when someone else took the time", async () => {
    const user = userEvent.setup();
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url === "/api/availability") return json(availability);
      if (url === "/api/bookings" && init?.method === "POST")
        return json({ detail: "Избраният час вече не е свободен. Моля, изберете друг." }, 400);
      throw new Error(`unexpected ${url}`);
    });

    render(<BookingWizard initialCategories={categories} />);
    await user.click(screen.getByRole("radio", { name: /Без предпочитание/ }));
    await user.click(screen.getByRole("button", { name: /Боядисване на корени/ }));
    await user.click(screen.getAllByRole("button", { name: /Продължи/ })[0]);
    await user.click(await screen.findByRole("button", { name: "09:00" }));
    await user.click(screen.getAllByRole("button", { name: /Към данните/ })[0]);
    await user.type(await screen.findByLabelText(/^Име \*$/), "Петя");
    await user.type(screen.getByLabelText(/^Телефон \*$/), "0877000111");
    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: "Потвърди резервацията" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("вече не е свободен");
    expect(await screen.findByRole("heading", { name: "Кога ви е удобно?" })).toBeInTheDocument();
  });
});
