"use client";

import { CalendarPlus, Check, Link2 } from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";

import type { Booking } from "@/lib/api";
import { bookingToIcs } from "@/lib/ics";

import { Button } from "../ui/Button";
import { BookingCard } from "./BookingCard";

export function manageHref(booking: Booking) {
  return `/rezervacia/${booking.cancel_token}`;
}

export function downloadIcs(booking: Booking) {
  const url = new URL(manageHref(booking), window.location.origin).toString();
  const blob = new Blob([bookingToIcs(booking, url)], { type: "text/calendar;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "sis-esthetics.ics";
  link.click();
  URL.revokeObjectURL(link.href);
}

export function DoneStep({ booking, onAgain }: { booking: Booking; onAgain: () => void }) {
  return (
    <section className="mx-auto max-w-2xl">
      <div className="mb-10 flex flex-col items-center text-center">
        <motion.span
          initial={{ scale: 0, rotate: -30 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: "spring", stiffness: 260, damping: 16 }}
          className="grid size-20 place-items-center rounded-full bg-accent text-accent-ink shadow-[0_20px_50px_-20px_var(--accent)]"
        >
          <Check className="size-10" strokeWidth={2.5} />
        </motion.span>
        <motion.h2
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="mt-6 font-display text-5xl font-semibold text-ink"
        >
          Очакваме ви!
        </motion.h2>
        <p className="mt-3 text-ink-soft">Резервацията е потвърдена. Запазете линка по-долу, за да я управлявате.</p>
      </div>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}>
        <BookingCard booking={booking} />
      </motion.div>

      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Button variant="secondary" onClick={() => downloadIcs(booking)}>
          <CalendarPlus className="size-4" /> Добави в календара
        </Button>
        <Link
          href={manageHref(booking)}
          className="inline-flex items-center gap-2 rounded-full px-6 py-3 text-sm font-semibold text-ink ring-1 ring-line transition hover:bg-surface"
        >
          <Link2 className="size-4" /> Управление на резервацията
        </Link>
        <Button variant="ghost" onClick={onAgain}>
          Нова резервация
        </Button>
      </div>
    </section>
  );
}
