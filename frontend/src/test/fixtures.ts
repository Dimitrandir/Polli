import type { Category, Service, Slot } from "@/lib/api";

export function service(overrides: Partial<Service> = {}): Service {
  return {
    id: 1,
    name: "Боядисване на корени",
    description: "",
    price: "60.00",
    duration_minutes: 90,
    is_online_bookable: true,
    group: 1,
    category: "kosa",
    specialists: [
      { id: 1, name: "Поли", price: "80.00", duration_minutes: 90 },
      { id: 2, name: "Иван", price: "60.00", duration_minutes: 90 },
    ],
    ...overrides,
  };
}

export const colour = service();
export const manicure = service({
  id: 2,
  name: "Маникюр с гел лак",
  price: "28.12",
  category: "nokti",
  group: 2,
  specialists: [{ id: 3, name: "Надя", price: "28.12", duration_minutes: 90 }],
});

export const categories: Category[] = [
  { id: 1, name: "Коса", slug: "kosa", groups: [{ id: 1, name: "Боядисване", description: "", services: [colour] }] },
  { id: 2, name: "Нокти", slug: "nokti", groups: [{ id: 2, name: "Гел лак", description: "", services: [manicure] }] },
];

export const slot: Slot = {
  start: "2026-10-19T09:00:00+03:00",
  end: "2026-10-19T10:30:00+03:00",
  total_price: "108.12",
  items: [],
};
