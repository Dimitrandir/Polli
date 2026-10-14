import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { localHref, Markdown } from "./markdown";

describe("localHref", () => {
  it("sends links to the old site to the new pages", () => {
    expect(localHref("https://sisesthetics.com/")).toBe("/");
    expect(localHref("https://sisesthetics.com/contacts/")).toBe("/kontakti");
    expect(localHref("https://sisesthetics.com/booking/")).toBe("/rezervacia");
    expect(localHref("https://sisesthetics.com/kak-da-spr%D0%B5%D1%82%D0%B5-kosopada/")).toBe(
      `/statii/${encodeURIComponent("kak-da-sprете-kosopada")}`,
    );
  });

  it("keeps paths on the new site, as the assistant writes them", () => {
    expect(localHref("/statii/kosopad")).toBe("/statii/kosopad");
    expect(localHref("/rezervacia")).toBe("/rezervacia");
  });

  it("keeps other sites and drops unsafe links", () => {
    expect(localHref("https://jenskitaini.com/")).toBe("https://jenskitaini.com/");
    expect(localHref("mailto:salon@example.com")).toBe("mailto:salon@example.com");
    expect(localHref("javascript:alert(1)")).toBeNull();
  });
});

describe("Markdown", () => {
  it("renders headings, lists, quotes and inline formatting", () => {
    const source = [
      "## Какво е топлинно увреждане?",
      "",
      "Първи ред",
      "втори **важен** ред с [линк](https://example.com).",
      "",
      "* едно",
      "* *две*",
      "",
      "3. трето",
      "",
      "> Цитат",
      "",
      "***",
    ].join("\n");
    const { container } = render(<Markdown source={source} />);

    expect(screen.getByRole("heading", { level: 2, name: "Какво е топлинно увреждане?" })).toBeInTheDocument();
    expect(container.querySelector("p br")).not.toBeNull();
    expect(screen.getByText("важен").tagName).toBe("STRONG");
    const link = screen.getByRole("link", { name: "линк" });
    expect(link).toHaveAttribute("href", "https://example.com/");
    expect(link).toHaveAttribute("target", "_blank");
    expect(container.querySelectorAll("ul li")).toHaveLength(2);
    expect(screen.getByText("две").tagName).toBe("EM");
    expect(container.querySelector("ol")).toHaveAttribute("start", "3");
    expect(container.querySelector("blockquote")).toHaveTextContent("Цитат");
    expect(container.querySelector("hr")).not.toBeNull();
  });

  it("shows raw HTML as text", () => {
    const { container } = render(<Markdown source={'<img src=x onerror="alert(1)">'} />);
    expect(container.querySelector("img")).toBeNull();
    expect(container).toHaveTextContent('<img src=x onerror="alert(1)">');
  });

  it("turns autolinks into links", () => {
    render(<Markdown source="Вижте <https://www.cpdp.bg/>" />);
    expect(screen.getByRole("link", { name: "https://www.cpdp.bg/" })).toHaveAttribute("href", "https://www.cpdp.bg/");
  });
});
