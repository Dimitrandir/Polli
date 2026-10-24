import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ChatThread } from "./ChatThread";

describe("ChatThread", () => {
  it("scrolls to the box to write in, also when scrollIntoView returns a Promise", () => {
    const scroll = vi.fn(() => Promise.resolve());
    Element.prototype.scrollIntoView = scroll as unknown as Element["scrollIntoView"];
    const { container, unmount } = render(<ChatThread messages={[]} side="salon" onSend={async () => true} />);
    expect(scroll).toHaveBeenCalledTimes(1);
    const target = scroll.mock.contexts[0] as Element;
    // The scroll target comes after the form, so the box stays on screen.
    expect(container.querySelector("form")?.compareDocumentPosition(target)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(() => unmount()).not.toThrow();
  });
});
