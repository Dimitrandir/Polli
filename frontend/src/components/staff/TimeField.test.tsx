import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { parseTime, TimeField } from "./TimeField";

function Harness({ onChange }: { onChange: (v: string) => void }) {
  const [value, setValue] = useState("14:45");
  return (
    <label>
      Начало
      <TimeField
        title="Начало"
        value={value}
        onChange={(v) => {
          setValue(v);
          onChange(v);
        }}
      />
    </label>
  );
}

describe("parseTime", () => {
  it("reads the usual ways of typing a time", () => {
    expect(parseTime("14:30")).toBe("14:30");
    expect(parseTime("9.05")).toBe("09:05");
    expect(parseTime("930")).toBe("09:30");
    expect(parseTime("1430")).toBe("14:30");
    expect(parseTime("8")).toBe("08:00");
    expect(parseTime("24:00")).toBeNull();
    expect(parseTime("12:75")).toBeNull();
    expect(parseTime("abc")).toBeNull();
  });
});

describe("TimeField", () => {
  it("opens hour and minute wheels in 24-hour time and 5-minute steps", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    await user.click(screen.getByLabelText("Начало"));
    const dialog = screen.getByRole("dialog", { name: "Начало" });
    const hours = within(dialog).getByRole("listbox", { name: "Час" });
    const minutes = within(dialog).getByRole("listbox", { name: "Минути" });
    expect(within(hours).getAllByRole("option")).toHaveLength(24);
    expect(within(minutes).getAllByRole("option").map((o) => o.textContent)).toEqual([
      "00", "05", "10", "15", "20", "25", "30", "35", "40", "45", "50", "55",
    ]);
    expect(within(dialog).queryByText(/AM|PM/)).toBeNull();

    await user.click(within(hours).getByRole("option", { name: "16" }));
    await user.click(within(minutes).getByRole("option", { name: "30" }));
    await user.click(within(dialog).getByRole("button", { name: "Готово" }));
    expect(onChange).toHaveBeenLastCalledWith("16:30");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByLabelText("Начало")).toHaveValue("16:30");
  });

  it("keeps the old time when the wheels are cancelled", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    await user.click(screen.getByLabelText("Начало"));
    const dialog = screen.getByRole("dialog", { name: "Начало" });
    await user.click(within(within(dialog).getByRole("listbox", { name: "Час" })).getByRole("option", { name: "09" }));
    await user.click(within(dialog).getByRole("button", { name: "Отказ" }));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Начало")).toHaveValue("14:45");
  });

  it("lets the time be typed from the keyboard", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    await user.click(screen.getByLabelText("Начало"));
    await user.click(screen.getByRole("button", { name: "Въведи от клавиатурата" }));
    const input = screen.getByLabelText("Начало");
    expect(input).toHaveFocus();
    expect(input).toHaveAttribute("inputmode", "numeric");
    await user.clear(input);
    await user.type(input, "1107{Enter}");
    expect(onChange).toHaveBeenLastCalledWith("11:07");
    expect(input).toHaveValue("11:07");
  });
});
