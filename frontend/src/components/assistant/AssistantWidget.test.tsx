import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Proposal } from "@/lib/assistant-api";

import { AssistantWidget, STORAGE_KEY } from "./AssistantWidget";

function json(body: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), { status }));
}

const anonymous = { authenticated: false, user: null, google_client_id: "" };

const proposal: Proposal = {
  id: "p1",
  start: "2026-10-19T10:00:00+03:00",
  date: "2026-10-19",
  weekday: "понеделник",
  time: "10:00",
  end: "11:30",
  total_price: "80.00",
  items: [
    {
      service_id: 3,
      service: "Боядисване на корени",
      specialist_id: 1,
      specialist: "Павлинка Ботева",
      start: "10:00",
      end: "11:30",
      price: "80.00",
    },
  ],
  note: "",
  booking: null,
};

describe("AssistantWidget", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    localStorage.clear();
    vi.stubGlobal("fetch", fetchMock);
    Element.prototype.scrollIntoView = vi.fn();
  });
  afterEach(() => vi.unstubAllGlobals());

  it("stays hidden while the assistant is switched off", async () => {
    fetchMock.mockImplementation(() => json({ enabled: false }));
    render(<AssistantWidget />);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(screen.queryByRole("button", { name: /Попитайте ни/ })).not.toBeInTheDocument();
  });

  it("answers with article links and books a time after the visitor confirms", async () => {
    const user = userEvent.setup();
    const sent: unknown[] = [];
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url === "/api/assistant") return json({ enabled: true });
      if (url === "/api/auth/session") return json(anonymous);
      if (url === "/api/assistant/chat") {
        const body = JSON.parse(String(init?.body));
        sent.push(body);
        if (sent.length === 1)
          return json({
            id: "c1",
            messages: [
              { role: "user", text: body.message },
              { role: "assistant", text: "Често е от стрес. [Как да спрете косопада](/statii/kosopad)" },
            ],
          });
        return json({
          id: "c1",
          messages: [
            { role: "user", text: "Защо ми пада косата?" },
            { role: "assistant", text: "Често е от стрес." },
            { role: "user", text: body.message },
            { role: "assistant", text: "Ето часа:", proposals: [proposal] },
          ],
        });
      }
      if (url === "/api/assistant/proposals/p1/confirm") {
        const body = JSON.parse(String(init?.body));
        expect(body).toEqual({
          client: { first_name: "Ана", last_name: "", phone: "0888999111", email: "" },
          consent: true,
        });
        return json({ ...proposal, booking: { cancel_token: "tok" } }, 201);
      }
      throw new Error(`unexpected ${url}`);
    });

    render(<AssistantWidget />);
    await user.click(await screen.findByRole("button", { name: /Попитайте ни/ }));
    const dialog = screen.getByRole("dialog", { name: "AI асистент" });

    await user.type(within(dialog).getByLabelText("Вашият въпрос"), "Защо ми пада косата?{Enter}");
    const link = await within(dialog).findByRole("link", { name: "Как да спрете косопада" });
    expect(link).toHaveAttribute("href", "/statii/kosopad");
    expect(localStorage.getItem(STORAGE_KEY)).toBe("c1");

    await user.type(within(dialog).getByLabelText("Вашият въпрос"), "Запиши ме при Поли{Enter}");
    const card = await within(dialog).findByRole("article", { name: "Предложен час" });
    expect(sent[1]).toEqual({ conversation: "c1", message: "Запиши ме при Поли" });
    expect(card).toHaveTextContent("Павлинка Ботева");

    const confirm = within(card).getByRole("button", { name: "Потвърди часа" });
    expect(confirm).toBeDisabled();
    await user.type(within(card).getByLabelText("Име"), "Ана");
    await user.type(within(card).getByLabelText("Телефон"), "0888999111");
    await user.click(within(card).getByRole("checkbox"));
    await user.click(confirm);
    expect(await within(card).findByText("Часът е запазен. Очакваме ви!")).toBeInTheDocument();
    expect(within(card).getByRole("link", { name: /Виж или откажи/ })).toHaveAttribute("href", "/rezervacia/tok");
  });

  it("shows the error and keeps the question when the assistant is unavailable", async () => {
    const user = userEvent.setup();
    fetchMock.mockImplementation((url: string) => {
      if (url === "/api/assistant") return json({ enabled: true });
      if (url === "/api/auth/session") return json(anonymous);
      return json({ detail: "Асистентът в момента не е достъпен." }, 503);
    });
    render(<AssistantWidget />);
    await user.click(await screen.findByRole("button", { name: /Попитайте ни/ }));
    await user.click(screen.getByRole("button", { name: "Какво да правя при косопад?" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("не е достъпен");
    expect(screen.getByLabelText("Вашият въпрос")).toHaveValue("Какво да правя при косопад?");
  });
});
