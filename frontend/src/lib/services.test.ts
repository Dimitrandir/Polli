import { describe, expect, it } from "vitest";

import type { Category } from "@/lib/api";
import { categories, service } from "@/test/fixtures";

import { itemRange, menuItems, normalize, searchMenu, serviceLabel } from "./services";

const short = service({ id: 10, name: "Кичури", option: "на половината коса", price: "67.00", specialists: [] });
const whole = service({ id: 11, name: "Кичури", option: "на цялата коса", price: "82.00", specialists: [] });
const art = service({ id: 12, name: "Кичури с арт техника", price: "67.00", specialists: [] });
const group = { id: 5, name: "Боядисване и кичури", description: "", services: [short, art, whole] };

describe("services menu", () => {
  it("joins name and option with a short dash", () => {
    expect(serviceLabel(whole)).toBe("Кичури - на цялата коса");
    expect(serviceLabel(art)).toBe("Кичури с арт техника");
  });

  it("folds the options of a service into one entry, in menu order", () => {
    const items = menuItems(group);
    expect(items.map((i) => i.name)).toEqual(["Кичури", "Кичури с арт техника"]);
    expect(items[0].options.map((o) => o.id)).toEqual([10, 11]);
    expect(itemRange(items[0], (s) => Number(s.price))).toEqual({
      minPrice: 67,
      priceVaries: true,
      minDuration: 90,
      maxDuration: 90,
    });
  });

  it("searches names, options, groups and categories, ignoring case", () => {
    const menu: Category[] = [...categories, { id: 3, name: "Коса+", slug: "kosa-2", groups: [group] }];
    expect(normalize("  КИЧУРИ  Цялата ")).toBe("кичури цялата");
    const byOption = searchMenu(menu, "цялата");
    expect(byOption.flatMap((c) => c.groups.flatMap((g) => g.items.map((i) => i.name)))).toEqual(["Кичури"]);
    const byGroup = searchMenu(menu, "гел лак");
    expect(byGroup.map((c) => c.category.slug)).toEqual(["nokti"]);
    expect(searchMenu(menu, "кичури арт")[0].groups[0].items.map((i) => i.name)).toEqual(["Кичури с арт техника"]);
    expect(searchMenu(menu, "")).toHaveLength(3);
    expect(searchMenu(menu, "няма такава")).toEqual([]);
  });
});
