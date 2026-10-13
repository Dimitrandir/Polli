import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useReducer } from "react";
import { describe, expect, it } from "vitest";

import type { Category } from "@/lib/api";
import { initialState, reducer } from "@/lib/booking-state";
import { service } from "@/test/fixtures";

import { ServicesStep } from "./ServicesStep";

const cut = service({ id: 3, name: "Дамско подстригване", group: 3 });
const colour = service({ id: 4, name: "Боядисване на корени", group: 4 });
const hair: Category[] = [
  {
    id: 1,
    name: "Коса",
    slug: "kosa",
    groups: [
      { id: 3, name: "Подстригване и прически", description: "", services: [cut] },
      { id: 4, name: "Боядисване и кичури", description: "", services: [colour] },
    ],
  },
];

function Step() {
  const [state, dispatch] = useReducer(reducer, undefined, () => initialState());
  return <ServicesStep categories={hair} state={state} dispatch={dispatch} />;
}

describe("ServicesStep", () => {
  it("shows a group's services when its header is clicked", async () => {
    const user = userEvent.setup();
    render(<Step />);

    const group = screen.getByRole("button", { name: /Подстригване и прически/ });
    expect(group).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("button", { name: /Дамско подстригване/ })).not.toBeInTheDocument();

    await user.click(group);
    expect(group).toHaveAttribute("aria-expanded", "true");
    // Choosing a service keeps its group open.
    await user.click(screen.getByRole("button", { name: /Дамско подстригване/ }));
    expect(screen.getByRole("button", { name: /Дамско подстригване/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByRole("button", { name: /Боядисване на корени/ })).not.toBeInTheDocument();
  });

  it("opens every matching group while searching", async () => {
    const user = userEvent.setup();
    render(<Step />);

    await user.type(screen.getByRole("searchbox"), "корени");
    expect(screen.getByRole("button", { name: /Боядисване на корени/ })).toBeInTheDocument();
  });
});
