import type { Category, Service, ServiceGroup } from "./api";

/** One entry in the menu: a service and its options ("на къса коса", "на дълга коса"…). */
export type MenuItem = {
  key: string;
  name: string;
  description: string;
  /** The bookable services behind this entry; one per option, or just one when there are no options. */
  options: Service[];
};

/** "Кичури - на цялата коса", or just the name when the service has no options. */
export function serviceLabel(service: Pick<Service, "name" | "option">): string {
  return service.option ? `${service.name} - ${service.option}` : service.name;
}

/** Folds services with the same name in a group into one entry, keeping the menu order. */
export function menuItems(group: ServiceGroup): MenuItem[] {
  const items = new Map<string, MenuItem>();
  for (const service of group.services) {
    const key = `${group.id}:${service.name}`;
    const item = items.get(key);
    if (item) {
      item.options.push(service);
      if (!item.description) item.description = service.description;
    } else {
      items.set(key, { key, name: service.name, description: service.description, options: [service] });
    }
  }
  return [...items.values()];
}

/** Lower case and without accents, so "КИЧУРИ" and "кичури" match. */
export function normalize(text: string): string {
  return text.toLocaleLowerCase("bg").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim();
}

/** Every word of the query appears in the service, its options, its group or its category. */
export function matches(item: MenuItem, query: string, context: string[] = []): boolean {
  const words = normalize(query).split(" ").filter(Boolean);
  if (!words.length) return true;
  const haystack = normalize([item.name, item.description, ...item.options.map((o) => o.option), ...context].join(" "));
  return words.every((w) => haystack.includes(w));
}

/** The menu with only the entries that match; empty groups and categories are dropped. */
export function searchMenu(categories: Category[], query: string) {
  return categories
    .map((category) => ({
      category,
      groups: category.groups
        .map((group) => ({
          group,
          items: menuItems(group).filter((item) => matches(item, query, [group.name, category.name])),
        }))
        .filter((g) => g.items.length > 0),
    }))
    .filter((c) => c.groups.length > 0);
}

/** Lowest price and duration range of an entry, for "от 42 €" and "30 мин. - 1 ч.". */
export function itemRange(item: MenuItem, priceOf: (s: Service) => number) {
  const prices = item.options.map(priceOf);
  const durations = item.options.map((o) => o.duration_minutes);
  return {
    minPrice: Math.min(...prices),
    priceVaries: new Set(prices).size > 1,
    minDuration: Math.min(...durations),
    maxDuration: Math.max(...durations),
  };
}

/** A copy of the set with the id added, or removed when it was there; for groups that open and close. */
export function toggleId(ids: Set<number>, id: number): Set<number> {
  const next = new Set(ids);
  if (!next.delete(id)) next.add(id);
  return next;
}
