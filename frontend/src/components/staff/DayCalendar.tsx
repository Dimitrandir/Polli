"use client";

import { CalendarDays, Check, ChevronDown, ChevronLeft, ChevronRight, Globe, LogOut, Menu, Plus, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ApiError } from "@/lib/api";
import {
  buildBlocks,
  clockLabel,
  headerDate,
  minutesInDay,
  salonClock,
  snapMinutes,
  specialistColor,
  visibleHours,
  type Block,
} from "@/lib/calendar";
import { addDays, todayKey } from "@/lib/format";
import { staffApi, type DaySchedule, type StaffService } from "@/lib/staff-api";

import { BookingSheet } from "./BookingSheet";
import { NewBookingSheet, type NewBookingDraft } from "./NewBookingSheet";

/** Pixels per minute: one hour is 84 px tall, as in Studio24 on a phone. */
const PX = 1.4;
const GUTTER = 52;
const REFRESH_MS = 60_000;

export function DayCalendar({ initialDate }: { initialDate?: string }) {
  const router = useRouter();
  const [date, setDate] = useState(initialDate ?? todayKey());
  const [schedule, setSchedule] = useState<DaySchedule | null>(null);
  const [services, setServices] = useState<StaffService[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [draft, setDraft] = useState<NewBookingDraft | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [now, setNow] = useState(() => salonClock(new Date()));
  const scroller = useRef<HTMLDivElement>(null);
  const scrolledFor = useRef<string | null>(null);
  const requested = useRef(date);

  const load = useCallback(
    async (day: string) => {
      setLoading(true);
      try {
        const data = await staffApi.day(day);
        if (day !== requested.current) return; // the user has already moved to another day
        setSchedule(data);
        setError(null);
      } catch (e) {
        if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
          router.replace("/personal/vhod");
          return;
        }
        setError(e instanceof ApiError ? e.message : "Не успях да заредя графика.");
      } finally {
        setLoading(false);
      }
    },
    [router],
  );

  useEffect(() => {
    requested.current = date;
    void load(date);
    window.history.replaceState(null, "", date === todayKey() ? "/personal" : `/personal?d=${date}`);
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void load(date);
      setNow(salonClock(new Date()));
    }, REFRESH_MS);
    return () => clearInterval(timer);
  }, [date, load]);

  useEffect(() => {
    staffApi
      .services()
      .then(setServices)
      .catch(() => setServices([]));
  }, []);

  const current = schedule && schedule.date === date ? schedule : null;
  const hours = useMemo(() => (current ? visibleHours(current) : { from: 9, to: 19 }), [current]);
  const blocks = useMemo(() => (current ? buildBlocks(current) : new Map<number, Block[]>()), [current]);
  const top = hours.from * 60;
  const height = (hours.to - hours.from) * 60 * PX;
  const selected = current?.bookings.find((b) => b.id === selectedId) ?? null;

  // Open today at the current time, other days at the top.
  useEffect(() => {
    if (!current || !scroller.current || scrolledFor.current === current.date) return;
    scrolledFor.current = current.date;
    const target = current.date === now.date ? Math.max(0, (now.minutes - top - 60) * PX) : 0;
    scroller.current.scrollTop = target;
  }, [current, now, top]);

  function openNew(specialist?: number, minutes?: number) {
    if (!current?.specialists.length) return;
    const fallback = current.date === now.date ? snapMinutes(now.minutes + 15) : top;
    setDraft({ date: current.date, specialist: specialist ?? current.specialists[0].id, minutes: minutes ?? fallback });
  }

  async function logout() {
    await staffApi.logout().catch(() => null);
    router.replace("/personal/vhod");
  }

  const head = headerDate(date);
  const columns = current?.specialists ?? [];
  const gridColumns = `${GUTTER}px repeat(${Math.max(columns.length, 1)}, minmax(9.5rem, 1fr))`;

  return (
    <div className="flex h-dvh flex-col bg-white text-neutral-900">
      {/* Top bar: date and weekday, previous / today / next, menu – like Studio24. */}
      <header className="relative z-30 flex h-14 shrink-0 items-center bg-[var(--staff)] px-3 text-white shadow">
        <label className="relative flex cursor-pointer flex-col leading-tight">
          <span className="flex items-center gap-1 text-lg font-bold">
            {head.day} <ChevronDown size={16} />
          </span>
          <span className="text-sm opacity-90">{head.weekday}</span>
          <input
            type="date"
            aria-label="Избери дата"
            value={date}
            onChange={(e) => e.target.value && setDate(e.target.value)}
            className="absolute inset-0 cursor-pointer opacity-0"
          />
        </label>
        <div className="mx-auto flex items-center gap-1">
          <button aria-label="Предишен ден" onClick={() => setDate(addDays(date, -1))} className="p-2.5">
            <ChevronLeft size={26} />
          </button>
          <button aria-label="Днес" onClick={() => setDate(todayKey())} className="rounded-lg p-2 hover:bg-white/15">
            <CalendarDays size={30} />
          </button>
          <button aria-label="Следващ ден" onClick={() => setDate(addDays(date, 1))} className="p-2.5">
            <ChevronRight size={26} />
          </button>
        </div>
        <button aria-label="Меню" onClick={() => setMenuOpen((o) => !o)} className="p-2">
          <Menu size={28} />
        </button>
        {loading && <span className="absolute right-0 bottom-0 left-0 h-0.5 animate-pulse bg-white/70" />}
        {menuOpen && (
          <div className="absolute top-full right-2 mt-1 w-56 overflow-hidden rounded-xl bg-white text-neutral-800 shadow-xl">
            <MenuItem
              icon={<CalendarDays size={18} />}
              label="Днес"
              onClick={() => {
                setDate(todayKey());
                setMenuOpen(false);
              }}
            />
            <MenuItem
              icon={<RefreshCw size={18} />}
              label="Обнови"
              onClick={() => {
                void load(date);
                setMenuOpen(false);
              }}
            />
            <MenuItem icon={<LogOut size={18} />} label="Изход" onClick={logout} />
          </div>
        )}
      </header>

      {error && <p className="bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p>}

      <div ref={scroller} className="relative flex-1 overflow-auto overscroll-contain">
        <div className="grid min-w-full" style={{ gridTemplateColumns: gridColumns }}>
          {/* Column headers stay on top while scrolling down. */}
          <div className="sticky top-0 left-0 z-20 border-b border-neutral-200 bg-white" />
          {columns.map((s, index) => (
            <div
              key={s.id}
              className="sticky top-0 z-10 truncate border-b border-l border-white px-2 py-2 text-center text-sm font-semibold text-white"
              style={{ background: specialistColor(s.color, index) }}
              title={s.name}
            >
              {s.name}
            </div>
          ))}
          {current && !columns.length && (
            <div className="p-6 text-neutral-500">Няма активни специалисти. Добавете ги от админ панела.</div>
          )}

          {/* Hours on the left stay visible while scrolling sideways. */}
          <div className="sticky left-0 z-10 bg-white" style={{ height }}>
            {Array.from({ length: hours.to - hours.from }, (_, i) => (
              <span
                key={i}
                className="absolute right-1.5 left-0 -translate-y-1/2 text-right text-xs text-neutral-600 first:translate-y-0"
                style={{ top: i * 60 * PX }}
              >
                {clockLabel((hours.from + i) * 60)}
              </span>
            ))}
          </div>

          {columns.map((s, index) => {
            const color = specialistColor(s.color, index);
            return (
              <div
                key={s.id}
                className="relative cursor-pointer border-l border-neutral-200 bg-neutral-100"
                style={{ height }}
                onClick={(e) => {
                  const y = e.clientY - e.currentTarget.getBoundingClientRect().top;
                  openNew(s.id, snapMinutes(top + y / PX));
                }}
              >
                {/* Working time is white, the rest stays grey. */}
                {s.working.map((w) => (
                  <div
                    key={w.start}
                    className="absolute inset-x-0 bg-white"
                    style={{
                      top: (minutesInDay(w.start, date) - top) * PX,
                      height: (minutesInDay(w.end, date) - minutesInDay(w.start, date)) * PX,
                    }}
                  />
                ))}
                {s.time_off.map((t) => (
                  <div
                    key={t.start}
                    className="absolute inset-x-0 overflow-hidden px-2 py-1 text-xs text-neutral-500"
                    style={{
                      top: (minutesInDay(t.start, date) - top) * PX,
                      height: (minutesInDay(t.end, date) - minutesInDay(t.start, date)) * PX,
                      background:
                        "repeating-linear-gradient(135deg, #e5e5e5 0 6px, #f5f5f5 6px 12px)",
                    }}
                  >
                    {t.reason || "Отсъства"}
                  </div>
                ))}
                {/* Hour and half-hour lines. */}
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-0"
                  style={{
                    backgroundImage: `repeating-linear-gradient(to bottom, #d4d4d4 0 1px, transparent 1px ${30 * PX}px, #ececec ${30 * PX}px ${30 * PX + 1}px, transparent ${30 * PX + 1}px ${60 * PX}px)`,
                  }}
                />
                {now.date === date && now.minutes >= top && now.minutes <= hours.to * 60 && (
                  <div
                    aria-hidden
                    className="pointer-events-none absolute inset-x-0 z-[5] h-0.5 bg-red-500"
                    style={{ top: (now.minutes - top) * PX }}
                  />
                )}
                {(blocks.get(s.id) ?? []).map((block) => (
                  <BookingBlock
                    key={block.key}
                    block={block}
                    color={color}
                    top={(block.start - top) * PX}
                    height={(block.end - block.start) * PX}
                    onOpen={() => setSelectedId(block.booking.id)}
                  />
                ))}
              </div>
            );
          })}
        </div>

      </div>

      <button
        aria-label="Нов час"
        onClick={() => openNew()}
        className="fixed right-5 bottom-[max(1.25rem,env(safe-area-inset-bottom))] z-30 flex h-16 w-16 items-center justify-center rounded-full bg-[var(--staff)] text-white shadow-lg transition hover:scale-105"
      >
        <Plus size={32} />
      </button>

      {selected && current && (
        <BookingSheet
          key={`${selected.id}-${selected.status}-${selected.internal_note}`}
          booking={selected}
          specialists={current.specialists}
          onClose={() => setSelectedId(null)}
          onChanged={() => load(date)}
        />
      )}
      {draft && current && (
        <NewBookingSheet
          draft={draft}
          specialists={current.specialists}
          services={services}
          onClose={() => setDraft(null)}
          onCreated={() => load(date)}
        />
      )}
    </div>
  );
}

function BookingBlock({
  block,
  color,
  top,
  height,
  onOpen,
}: {
  block: Block;
  color: string;
  top: number;
  height: number;
  onOpen: () => void;
}) {
  const { booking } = block;
  const width = 100 / block.lanes;
  const noShow = booking.status === "no_show";
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onOpen();
      }}
      className={`absolute overflow-hidden rounded-[3px] border border-black/10 px-1.5 py-1 text-left text-white shadow-sm ${noShow ? "opacity-50" : ""}`}
      style={{
        top: top + 1,
        height: Math.max(height - 2, 18),
        left: `calc(${block.lane * width}% + 2px)`,
        width: `calc(${width}% - 4px)`,
        background: color,
      }}
    >
      <span className="flex items-center gap-1 text-[13px] leading-tight">
        <span className="truncate">
          {clockLabel(block.start)} - {clockLabel(block.end)}
        </span>
        {booking.source === "online" && <Globe size={12} className="shrink-0" aria-label="онлайн" />}
        {booking.status === "completed" && <Check size={14} className="ml-auto shrink-0" aria-label="изпълнена" />}
      </span>
      <span className={`block truncate text-[14px] leading-snug font-bold ${noShow ? "line-through" : ""}`}>
        {booking.client.name}
      </span>
      <span className="block text-[13px] leading-tight opacity-95">{block.services.join(", ")}</span>
    </button>
  );
}

function MenuItem({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-neutral-100">
      {icon}
      {label}
    </button>
  );
}
