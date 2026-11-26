import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { OnlineDaySheet } from "./OnlineBlocks";

function json(body: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), { status }));
}

const blocks = (canBlockSalon: boolean) => ({
  from: "2026-12-04",
  to: "2026-12-04",
  default_message: "В този ден може да резервирате час само по телефона!",
  can_block_salon: canBlockSalon,
  specialists: [
    { id: 1, name: "Поли", can_manage: true },
    { id: 2, name: "Иван", can_manage: canBlockSalon },
  ],
  blocks: [{ id: 5, date: "2026-12-04", specialist: 2, message: "" }],
});

describe("OnlineDaySheet", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("lets a specialist close only their own day, with a text", async () => {
    const user = userEvent.setup();
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url.startsWith("/api/staff/online-blocks?")) return json(blocks(false));
      if (url === "/api/staff/online-blocks" && init?.method === "POST") return json({ blocks: [] });
      throw new Error(`unexpected ${url}`);
    });
    const onChanged = vi.fn();
    render(<OnlineDaySheet date="2026-12-04" onClose={() => {}} onChanged={onChanged} />);

    expect(await screen.findByRole("checkbox", { name: /Целият салон/ })).toBeDisabled();
    // A colleague's closed day shows, but cannot be changed.
    expect(screen.getByRole("checkbox", { name: /Иван/ })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: /Иван/ })).toBeDisabled();

    await user.click(screen.getByRole("checkbox", { name: /Поли/ }));
    await user.type(screen.getByLabelText(/Текст за клиентите/), "На семинар съм.");
    await user.click(screen.getByRole("button", { name: "Запази" }));

    const posts = fetchMock.mock.calls.filter(([, init]) => init?.method === "POST");
    expect(posts).toHaveLength(1);
    expect(JSON.parse(posts[0][1].body)).toEqual({
      dates: ["2026-12-04"],
      specialist: 1,
      blocked: true,
      message: "На семинар съм.",
    });
    expect(onChanged).toHaveBeenCalled();
  });

  it("lets an administrator close the whole salon and reopen a colleague", async () => {
    const user = userEvent.setup();
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url.startsWith("/api/staff/online-blocks?")) return json(blocks(true));
      if (init?.method === "POST") return json({ blocks: [] });
      throw new Error(`unexpected ${url}`);
    });
    render(<OnlineDaySheet date="2026-12-04" onClose={() => {}} onChanged={() => {}} />);

    await user.click(await screen.findByRole("checkbox", { name: /Целият салон/ }));
    await user.click(screen.getByRole("checkbox", { name: /Иван/ }));
    await user.click(screen.getByRole("button", { name: "Запази" }));

    const bodies = fetchMock.mock.calls
      .filter(([, init]) => init?.method === "POST")
      .map(([, init]) => JSON.parse(init.body));
    expect(bodies).toEqual([
      { dates: ["2026-12-04"], specialist: null, blocked: true, message: "" },
      { dates: ["2026-12-04"], specialist: 2, blocked: false, message: "" },
    ]);
  });
});
