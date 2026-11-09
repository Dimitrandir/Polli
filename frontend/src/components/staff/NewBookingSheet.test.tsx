import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { StaffClient, StaffService } from "@/lib/staff-api";

import { NewBookingSheet } from "./NewBookingSheet";

const { recentServices, createBooking } = vi.hoisted(() => ({ recentServices: vi.fn(), createBooking: vi.fn() }));
vi.mock("@/lib/staff-api", () => ({ staffApi: { recentServices, createBooking } }));

const offer = { id: 1, price: "30.00", duration_minutes: 45 };
const services: StaffService[] = [
  { id: 10, name: "Подстригване", group: "Коса", specialists: [offer] },
  { id: 11, name: "Боядисване на корени", group: "Боядисване", specialists: [offer] },
  { id: 12, name: "Кичури", group: "Боядисване", specialists: [offer] },
];
const client: StaffClient = {
  id: 3,
  name: "Мария Иванова",
  first_name: "Мария",
  last_name: "Иванова",
  phone: "+359888123456",
  email: "",
  notes: "",
  is_blocked: false,
};

function open(withClient: StaffClient | null) {
  render(
    <NewBookingSheet
      draft={{ date: "2026-10-26", specialist: 1, minutes: 600, client: withClient }}
      specialists={[{ id: 1, name: "Поли", color: "", is_online_bookable: true }]}
      services={services}
      onClose={() => {}}
      onCreated={() => {}}
    />,
  );
}

const names = (list: HTMLElement) => within(list).getAllByRole("button").map((b) => b.textContent);

describe("NewBookingSheet", () => {
  it("puts the client's latest services first", async () => {
    recentServices.mockResolvedValue([{ service: 12, last_used: "2026-10-01T10:00:00+03:00" }]);
    open(client);
    const tag = await screen.findByText("Последно");
    expect(recentServices).toHaveBeenCalledWith(3);
    const list = tag.closest("ul")!;
    expect(names(list)[0]).toContain("Кичури");
    expect(within(list).getAllByText("Последно")).toHaveLength(1);
  });

  it("keeps the usual order without a client", () => {
    recentServices.mockClear();
    open(null);
    expect(recentServices).not.toHaveBeenCalled();
    const list = screen.getByText("Подстригване").closest("ul")!;
    expect(names(list)[0]).toContain("Подстригване");
    expect(screen.queryByText("Последно")).toBeNull();
  });

  it("lets staff book a longer visit than usual", async () => {
    recentServices.mockResolvedValue([]);
    createBooking.mockResolvedValue({});
    open(client);
    fireEvent.click(screen.getByText("Подстригване"));
    const group = screen.getByRole("group", { name: "Продължителност" });
    expect(within(group).getByRole("button", { name: "45 мин" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.queryByText(/Обичайно/)).toBeNull();

    fireEvent.click(within(group).getByRole("button", { name: "1 ч" }));
    expect(screen.getByText(/10:00 – 11:00/)).toBeTruthy();
    expect(screen.getByText("Обичайно: 45 мин")).toBeTruthy();
    fireEvent.click(screen.getByLabelText("15 минути повече"));
    expect(screen.getByText(/10:00 – 11:15/)).toBeTruthy();

    fireEvent.click(screen.getByText("Запази"));
    await vi.waitFor(() => expect(createBooking).toHaveBeenCalled());
    expect(createBooking.mock.calls[0][0]).toMatchObject({ services: [10], duration_minutes: 75 });
  });

  it("sends no duration when staff keep the usual one", async () => {
    recentServices.mockResolvedValue([]);
    createBooking.mockClear().mockResolvedValue({});
    open(client);
    fireEvent.click(screen.getByText("Подстригване"));
    fireEvent.click(screen.getByRole("button", { name: "1 ч" }));
    fireEvent.click(screen.getByText("Обичайно: 45 мин"));
    fireEvent.click(screen.getByText("Запази"));
    await vi.waitFor(() => expect(createBooking).toHaveBeenCalled());
    expect(createBooking.mock.calls[0][0]).not.toHaveProperty("duration_minutes");
  });
});
