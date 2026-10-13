import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import type { Category } from "@/lib/api";
import { service } from "@/test/fixtures";

import { ServicesCatalog } from "./ServicesCatalog";

const categories: Category[] = [
  {
    id: 1,
    name: "Коса",
    slug: "kosa",
    groups: [
      {
        id: 3,
        name: "Подстригване и прически",
        description: "Отключете истинския потенциал на косата си.",
        services: [service({ id: 3, name: "Дамско подстригване", group: 3 })],
      },
    ],
  },
];

describe("ServicesCatalog", () => {
  it("shows a group's description and opens its services on click", async () => {
    const user = userEvent.setup();
    render(<ServicesCatalog categories={categories} />);

    expect(screen.getByText("Отключете истинския потенциал на косата си.")).toBeInTheDocument();
    expect(screen.queryByText("Дамско подстригване")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Подстригване и прически/ }));
    expect(screen.getByText("Дамско подстригване")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Запази час за Дамско подстригване/ })).toHaveAttribute(
      "href",
      "/rezervacia?usluga=3",
    );
  });
});
