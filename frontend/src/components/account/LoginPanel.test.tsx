import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LoginPanel } from "./LoginPanel";

const { replace, refresh } = vi.hoisted(() => ({ replace: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace, refresh }) }));

function json(body: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), { status }));
}

const anonymous = { authenticated: false, user: null, google_client_id: "" };
const loggedIn = (has_profile: boolean) => ({
  authenticated: true,
  user: { email: "petya@example.com", name: "", has_profile, unread_messages: 0 },
  google_client_id: "",
});

describe("LoginPanel", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    replace.mockReset();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("logs in with a code from the email and asks a new client to finish the profile", async () => {
    const user = userEvent.setup();
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url === "/api/auth/session") return json(anonymous);
      if (url === "/api/auth/email") return json({ detail: "Изпратихме ви код за вход." });
      if (url === "/api/auth/email/verify") {
        const { code } = JSON.parse(String(init?.body));
        return code === "123456" ? json(loggedIn(false)) : json({ detail: "Грешен код." }, 400);
      }
      throw new Error(`unexpected ${url}`);
    });

    render(<LoginPanel next="/rezervacia" />);
    await user.type(screen.getByLabelText("Имейл"), "petya@example.com");
    await user.click(screen.getByRole("button", { name: /Изпрати ми код/ }));
    expect(await screen.findByText("Изпратихме ви код за вход.")).toBeInTheDocument();

    await user.type(screen.getByLabelText("Код от писмото"), "111111");
    await user.click(screen.getByRole("button", { name: "Влез" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Грешен код.");

    await user.clear(screen.getByLabelText("Код от писмото"));
    await user.type(screen.getByLabelText("Код от писмото"), "123456");
    await user.click(screen.getByRole("button", { name: "Влез" }));
    await vi.waitFor(() => expect(replace).toHaveBeenCalledWith("/profil"));
  });

  it("goes back where the client came from when the profile is complete", async () => {
    const user = userEvent.setup();
    fetchMock.mockImplementation((url: string) => {
      if (url === "/api/auth/session") return json(anonymous);
      if (url === "/api/auth/email") return json({ detail: "ok" });
      if (url === "/api/auth/email/verify") return json(loggedIn(true));
      throw new Error(`unexpected ${url}`);
    });
    render(<LoginPanel next="/rezervacia" />);
    await user.type(screen.getByLabelText("Имейл"), "petya@example.com");
    await user.click(screen.getByRole("button", { name: /Изпрати ми код/ }));
    await user.type(await screen.findByLabelText("Код от писмото"), "123456");
    await user.click(screen.getByRole("button", { name: "Влез" }));
    await vi.waitFor(() => expect(replace).toHaveBeenCalledWith("/rezervacia"));
  });

  it("never redirects to another site", async () => {
    fetchMock.mockImplementation(() => json(loggedIn(true)));
    render(<LoginPanel next="//evil.example" />);
    await vi.waitFor(() => expect(replace).toHaveBeenCalledWith("/profil"));
  });
});
