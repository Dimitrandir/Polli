"use client";

import { CalendarPlus, LoaderCircle, Phone } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { api, ApiError, type Booking } from "@/lib/api";

import { Button } from "../ui/Button";
import { Skeleton } from "../ui/Skeleton";
import { BookingCard } from "./BookingCard";
import { downloadIcs } from "./DoneStep";

export function ManageBooking({ token }: { token: string }) {
  const [booking, setBooking] = useState<Booking | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    api
      .booking(token)
      .then(setBooking)
      .catch((e: unknown) =>
        setError(e instanceof ApiError && e.status === 404 ? "Не намерихме такава резервация." : String((e as Error).message)),
      );
  }, [token]);

  async function cancel() {
    setCancelling(true);
    setError(null);
    try {
      setBooking(await api.cancelBooking(token));
      setConfirming(false);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Нещо се обърка. Опитайте отново.");
    } finally {
      setCancelling(false);
    }
  }

  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.25em] text-accent">Управление</p>
      <h1 className="mt-2 mb-8 font-display text-5xl font-semibold text-ink">Вашата резервация</h1>

      {!booking && !error && <Skeleton className="h-80" />}
      {error && (
        <p role="alert" className="mb-6 rounded-2xl bg-danger/10 px-4 py-3 text-sm text-danger">
          {error}
        </p>
      )}

      {booking && (
        <>
          <BookingCard booking={booking} />

          {booking.status === "confirmed" && (
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Button variant="secondary" onClick={() => downloadIcs(booking)}>
                <CalendarPlus className="size-4" /> Добави в календара
              </Button>
              {booking.can_cancel ? (
                <Button variant="ghost" onClick={() => setConfirming(true)} className="text-danger">
                  Откажи резервацията
                </Button>
              ) : (
                <p className="inline-flex items-center gap-2 text-sm text-ink-soft">
                  <Phone className="size-4" /> До часа остават по-малко от 24 часа – за промяна се обадете в салона.
                </p>
              )}
            </div>
          )}

          <AnimatePresence>
            {confirming && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                role="alertdialog"
                aria-label="Потвърдете отказа"
                className="mt-6 rounded-3xl bg-surface p-6 ring-1 ring-danger/40"
              >
                <p className="font-semibold text-ink">Сигурни ли сте, че искате да откажете?</p>
                <p className="mt-1 text-sm text-ink-soft">Часът ще бъде освободен за други клиенти.</p>
                <div className="mt-5 flex gap-3">
                  <Button variant="danger" onClick={cancel} disabled={cancelling}>
                    {cancelling && <LoaderCircle className="size-4 animate-spin" />} Да, откажи
                  </Button>
                  <Button variant="ghost" onClick={() => setConfirming(false)}>
                    Не
                  </Button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {booking.status === "cancelled" && (
            <Link href="/rezervacia" className="mt-8 inline-block font-semibold text-accent underline-offset-4 hover:underline">
              Запазете нов час →
            </Link>
          )}
        </>
      )}
    </div>
  );
}
