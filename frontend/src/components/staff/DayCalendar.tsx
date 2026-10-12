"use client";

import {
  CalendarDays,
  CalendarRange,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Columns3,
  LogOut,
  Menu,
  Plus,
  RefreshCw,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ApiError } from "@/lib/api";
import {
  clockLabel,
  columnBlocks,
  headerDate,
  hourRange,
  salonClock,
  salonDateTime,
  snapMinutes,
  specialistColor,
  weekTitle,
  type Block,
} from "@/lib/calendar";
import { addDays, startOfWeek, todayKey, weekdayParts } from "@/lib/format";
import {
  staffApi,
  type DaySchedule,
  type StaffService,
  type StaffSpecialist,
  type TimeOff,
  type WeekSchedule,
} from "@/lib/staff-api";

import { BookingSheet } from "./BookingSheet";
import { NewBookingSheet, type NewBookingDraft } from "./NewBookingSheet";
import { PX, TimeGrid, type GridColumn } from "./TimeGrid";
import { TimeOffSheet } from "./TimeOffSheet";

const REFRESH_MS = 60_000;

export type CalendarView = "day" | "week";

type Loaded = { kind: "day"; key: string; data: DaySchedule } | { kind: "week"; key: string; data: WeekSchedule };

/** The salon team's calendar: the day with a column per specialist, or one specialist's week. */
export function DayCalendar({
  initialDate,
  initialView = "day",
  initialSpecialist = null,
}: {
  initialDate?: string;
  initialView?: CalendarView;
  initialSpecialist?: number | null;
}) {
  const router = useRouter();
  const [date, setDate] = useState(initialDate ?? todayKey());
  const [view, setView] = useState<CalendarView>(initialView);
  const [weekSpecialist, setWeekSpecialist] = useState<number | null>(initialSpecialist);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [services, setServices] = useState<StaffService[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [draft, setDraft] = useState<NewBookingDraft | null>(null);
  const [openTimeOff, setOpenTimeOff] = useState<{ timeOff: TimeOff; column: GridColumn } | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [now, setNow] = useState(() => salonClock(new Date()));
  const scroller = useRef<HTMLDivElement>(null);
  const scrolledFor = useRef<string | null>(null);

  const monday = startOfWeek(date);
  const requestKey = view === "day" ? `day:${date}` : `week:${monday}:${weekSpecialist ?? ""}`;
  const requested = useRef(requestKey);

  const load = useCallback(async () => {
    const key = requestKey;
    setLoading(true);
    try {
      const next: Loaded =
        view === "day"
          ? { kind: "day", key, data: await staffApi.day(date) }
          : { kind: "week", key, data: await staffApi.week(monday, weekSpecialist) };
      if (key !== requested.current) return; // the user has already moved on
      setLoaded(next);
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
  }, [requestKey, view, date, monday, weekSpecialist, router]);

  useEffect(() => {
    requested.current = requestKey;
    void load();
    const params = new URLSearchParams();
    if (date !== todayKey()) params.set("d", date);
    if (view === "week") {
      params.set("v", "week");
      if (weekSpecialist) params.set("s", String(weekSpecialist));
    }
    const query = params.toString();
    window.history.replaceState(null, "", query ? `/personal?${query}` : "/personal");
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void load();
      setNow(salonClock(new Date()));
    }, REFRESH_MS);
    return () => clearInterval(timer);
  }, [requestKey, load, date, view, weekSpecialist]);

  useEffect(() => {
    staffApi
      .services()
      .then(setServices)
      .catch(() => setServices([]));
    // A specialist's week view opens on their own column.
    staffApi
      .session()
      .then((s) => setWeekSpecialist((current) => current ?? s.user?.specialist ?? null))
      .catch(() => null);
  }, []);

  const current = loaded && loaded.key === requestKey ? loaded : null;

  const specialists: StaffSpecialist[] = useMemo(() => (current ? current.data.specialists : []), [current]);
  const colorOf = useCallback(
    (id: number) => {
      const index = specialists.findIndex((s) => s.id === id);
      return specialistColor(specialists[index]?.color ?? "", Math.max(index, 0));
    },
    [specialists],
  );

  const columns: GridColumn[] = useMemo(() => {
    if (!current) return [];
    if (current.kind === "day") {
      const { data } = current;
      return data.specialists.map((s, index) => ({
        key: `s${s.id}`,
        date: data.date,
        specialist: s.id,
        title: s.name,
        color: specialistColor(s.color, index),
        titleStyle: "color" as const,
        working: s.working,
        timeOff: s.time_off,
        blocks: columnBlocks(data.bookings, data.date, s.id),
      }));
    }
    const { data } = current;
    const specialist = data.specialist;
    if (specialist === null) return [];
    return data.days.map((d) => {
      const parts = weekdayParts(d.date);
      return {
        key: `d${d.date}`,
        date: d.date,
        specialist,
        title: `${parts.weekday} ${parts.day}`,
        color: colorOf(specialist),
        titleStyle: "plain" as const,
        highlight: d.date === now.date,
        working: d.working,
        timeOff: d.time_off,
        blocks: columnBlocks(data.bookings, d.date, specialist),
        onTitleClick: () => {
          setDate(d.date);
          setView("day");
        },
      };
    });
  }, [current, colorOf, now.date]);

  const hours = useMemo(
    () =>
      hourRange(
        columns.flatMap((c) => [
          ...c.working.map((w) => ({ date: c.date, ...w })),
          ...c.blocks.flatMap((b) =>
            b.booking.items
              .filter((i) => i.specialist === c.specialist)
              .map((i) => ({ date: c.date, start: i.start, end: i.end })),
          ),
        ]),
      ),
    [columns],
  );
  const top = hours.from * 60;
  const bookings = current ? current.data.bookings : [];
  const selected = bookings.find((b) => b.id === selectedId) ?? null;
  const shownSpecialist = current?.kind === "week" ? current.data.specialist : null;

  // Open at the current time when today is on screen, otherwise at the top.
  useEffect(() => {
    if (!current || !scroller.current || scrolledFor.current === current.key) return;
    scrolledFor.current = current.key;
    const today = columns.some((c) => c.date === now.date);
    scroller.current.scrollTop = today ? Math.max(0, (now.minutes - top - 60) * PX) : 0;
  }, [current, columns, now, top]);

  function openNew(column?: GridColumn, minutes?: number) {
    const target = column ?? columns.find((c) => c.date === now.date) ?? columns[0];
    if (!target) return;
    const fallback = target.date === now.date ? snapMinutes(now.minutes + 15) : top;
    setDraft({ date: target.date, specialist: target.specialist, minutes: minutes ?? fallback });
  }

  async function move(block: Block, column: GridColumn, minutes: number) {
    const name = specialists.find((s) => s.id === column.specialist)?.name ?? "";
    const day = headerDate(column.date);
    const question = `Да преместя ли часа на ${block.booking.client.name} в ${day.weekday}, ${day.day.toLowerCase()} от ${clockLabel(minutes)}${
      column.specialist !== block.specialist ? ` при ${name}` : ""
    }?`;
    if (!window.confirm(question)) return;
    try {
      await staffApi.moveBooking(block.booking.id, {
        item: block.item,
        start: salonDateTime(column.date, minutes),
        specialist: column.specialist,
      });
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Не успях да преместя часа.");
    }
    void load();
  }

  async function logout() {
    await staffApi.logout().catch(() => null);
    router.replace("/personal/vhod");
  }

  function step(direction: 1 | -1) {
    setDate(addDays(date, direction * (view === "week" ? 7 : 1)));
  }

  function switchView(next: CalendarView) {
    setView(next);
    setMenuOpen(false);
  }

  const head = headerDate(date);
  const title = view === "week" ? weekTitle(monday, addDays(monday, 6)) : head.day;
  const subtitle = view === "week" ? "седмица" : head.weekday;

  return (
    <div className="flex h-dvh flex-col bg-white text-neutral-900">
      {/* Top bar: date, previous / today / next, menu – like Studio24. */}
      <header className="relative z-30 flex h-14 shrink-0 items-center bg-[var(--staff)] px-3 text-white shadow">
        <label className="relative flex cursor-pointer flex-col leading-tight">
          <span className="flex items-center gap-1 text-lg font-bold whitespace-nowrap">
            {title} <ChevronDown size={16} />
          </span>
          <span className="text-sm opacity-90">{subtitle}</span>
          <input
            type="date"
            aria-label="Избери дата"
            value={date}
            onChange={(e) => e.target.value && setDate(e.target.value)}
            className="absolute inset-0 cursor-pointer opacity-0"
          />
        </label>
        <div className="mx-auto flex items-center gap-1">
          <button
            aria-label={view === "week" ? "Предишна седмица" : "Предишен ден"}
            onClick={() => step(-1)}
            className="p-2.5"
          >
            <ChevronLeft size={26} />
          </button>
          <button aria-label="Днес" onClick={() => setDate(todayKey())} className="rounded-lg p-2 hover:bg-white/15">
            <CalendarDays size={30} />
          </button>
          <button
            aria-label={view === "week" ? "Следваща седмица" : "Следващ ден"}
            onClick={() => step(1)}
            className="p-2.5"
          >
            <ChevronRight size={26} />
          </button>
        </div>
        <button aria-label="Меню" onClick={() => setMenuOpen((o) => !o)} className="p-2">
          <Menu size={28} />
        </button>
        {loading && <span className="absolute right-0 bottom-0 left-0 h-0.5 animate-pulse bg-white/70" />}
        {menuOpen && (
          <div className="absolute top-full right-2 mt-1 w-60 overflow-hidden rounded-xl bg-white text-neutral-800 shadow-xl">
            <MenuItem
              icon={<Columns3 size={18} />}
              label="Ден (всички специалисти)"
              active={view === "day"}
              onClick={() => switchView("day")}
            />
            <MenuItem
              icon={<CalendarRange size={18} />}
              label="Седмица (един специалист)"
              active={view === "week"}
              onClick={() => switchView("week")}
            />
            <div className="h-px bg-neutral-200" />
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
                void load();
                setMenuOpen(false);
              }}
            />
            <MenuItem icon={<LogOut size={18} />} label="Изход" onClick={logout} />
          </div>
        )}
      </header>

      {view === "week" && specialists.length > 0 && (
        <div className="flex shrink-0 gap-2 overflow-x-auto border-b border-neutral-200 px-3 py-2">
          {specialists.map((s) => {
            const active = s.id === shownSpecialist;
            return (
              <button
                key={s.id}
                aria-pressed={active}
                onClick={() => setWeekSpecialist(s.id)}
                className="shrink-0 rounded-full border-2 px-3 py-1 text-sm font-semibold whitespace-nowrap"
                style={
                  active
                    ? { background: colorOf(s.id), borderColor: colorOf(s.id), color: "#fff" }
                    : { borderColor: colorOf(s.id), color: colorOf(s.id) }
                }
              >
                {s.name}
              </button>
            );
          })}
        </div>
      )}

      {error && <p className="bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p>}

      <div ref={scroller} className="relative flex-1 overflow-auto overscroll-contain">
        {current && !columns.length ? (
          <p className="p-6 text-neutral-500">Няма активни специалисти. Добавете ги от админ панела.</p>
        ) : (
          <TimeGrid
            columns={columns}
            hours={hours}
            now={now}
            scrollerRef={scroller}
            onEmpty={(column, minutes) => openNew(column, minutes)}
            onOpenBooking={setSelectedId}
            onOpenTimeOff={(timeOff, column) => setOpenTimeOff({ timeOff, column })}
            onMove={move}
          />
        )}
      </div>

      <button
        aria-label="Нов час"
        onClick={() => openNew()}
        className="fixed right-5 bottom-[max(1.25rem,env(safe-area-inset-bottom))] z-30 flex h-16 w-16 items-center justify-center rounded-full bg-[var(--staff)] text-white shadow-lg transition hover:scale-105"
      >
        <Plus size={32} />
      </button>

      {selected && (
        <BookingSheet
          key={`${selected.id}-${selected.status}-${selected.internal_note}`}
          booking={selected}
          specialists={specialists}
          onClose={() => setSelectedId(null)}
          onChanged={() => load()}
        />
      )}
      {draft && specialists.length > 0 && (
        <NewBookingSheet
          draft={draft}
          specialists={specialists}
          services={services}
          onClose={() => setDraft(null)}
          onCreated={() => load()}
        />
      )}
      {openTimeOff && (
        <TimeOffSheet
          timeOff={openTimeOff.timeOff}
          date={openTimeOff.column.date}
          specialistName={specialists.find((s) => s.id === openTimeOff.column.specialist)?.name ?? ""}
          onClose={() => setOpenTimeOff(null)}
          onChanged={() => load()}
        />
      )}
    </div>
  );
}

function MenuItem({
  icon,
  label,
  active,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-neutral-100 ${active ? "font-semibold text-[var(--staff)]" : ""}`}
    >
      {icon}
      {label}
    </button>
  );
}
