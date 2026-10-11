import clsx from "clsx";
import { CalendarCheck } from "lucide-react";

import type { Booking } from "@/lib/api";
import { formatLongDate, formatPrice, formatTime } from "@/lib/format";

const STATUS: Record<Booking["status"], { label: string; tone: string }> = {
  confirmed: { label: "Потвърдена", tone: "bg-success/15 text-success" },
  completed: { label: "Изпълнена", tone: "bg-surface-2 text-ink-soft" },
  no_show: { label: "Неявяване", tone: "bg-danger/10 text-danger" },
  cancelled: { label: "Отказана", tone: "bg-danger/10 text-danger" },
};

export function BookingCard({ booking }: { booking: Booking }) {
  const status = STATUS[booking.status];
  return (
    <div className="rounded-[2rem] bg-surface p-6 ring-1 ring-line sm:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <span className="grid size-12 place-items-center rounded-2xl bg-accent-soft text-accent">
            <CalendarCheck className="size-6" />
          </span>
          <div>
            <p className="font-display text-2xl font-semibold text-ink">{formatLongDate(booking.start)}</p>
            <p className="text-ink-soft">
              {formatTime(booking.start)} – {formatTime(booking.end)}
            </p>
          </div>
        </div>
        <span className={clsx("rounded-full px-3 py-1 text-xs font-semibold", status.tone)}>{status.label}</span>
      </div>

      <ul className="mt-6 divide-y divide-line border-y border-line">
        {booking.items.map((item) => (
          <li key={`${item.service}-${item.start}`} className="flex items-center justify-between gap-4 py-4">
            <div>
              <p className="font-semibold text-ink">{item.service_name}</p>
              <p className="text-sm text-ink-soft">
                {item.specialist_name} · {formatTime(item.start)} – {formatTime(item.end)}
              </p>
            </div>
            <span className="tabular-nums text-ink">{formatPrice(item.price)}</span>
          </li>
        ))}
      </ul>
      <div className="mt-4 flex items-baseline justify-between">
        <span className="text-sm text-ink-soft">Общо, плащане на място</span>
        <span className="font-display text-3xl font-semibold text-ink">{formatPrice(booking.total_price)}</span>
      </div>
      {booking.note && <p className="mt-4 rounded-2xl bg-surface-2 p-4 text-sm text-ink-soft">„{booking.note}“</p>}
    </div>
  );
}
