"use client";

import { Check, Globe } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { clockLabel, minutesInDay, snapMinutes, type Block } from "@/lib/calendar";
import type { Interval, TimeOff } from "@/lib/staff-api";

/** Pixels per minute: one hour is 84 px tall, as in Studio24 on a phone. */
export const PX = 1.4;
const GUTTER = 52;
/** Dropped visits land on 5-minute steps. */
const DROP_STEP = 5;
/** On a phone a visit is picked up by holding it, so a normal swipe still scrolls the calendar. */
const LONG_PRESS_MS = 400;

export type GridColumn = {
  key: string;
  date: string;
  specialist: number;
  title: string;
  color: string;
  /** Title in the specialist's colour (day view) or plain with a highlight for today (week view). */
  titleStyle: "color" | "plain";
  highlight?: boolean;
  working: Interval[];
  timeOff: TimeOff[];
  blocks: Block[];
  onTitleClick?: () => void;
};

type Drag = { block: Block; from: number; grab: number; target: number; start: number };

export function TimeGrid({
  columns,
  hours,
  now,
  scrollerRef,
  onEmpty,
  onOpenBooking,
  onOpenTimeOff,
  onMove,
}: {
  columns: GridColumn[];
  hours: { from: number; to: number };
  now: { date: string; minutes: number };
  scrollerRef: React.RefObject<HTMLDivElement | null>;
  onEmpty: (column: GridColumn, minutes: number) => void;
  onOpenBooking: (bookingId: number) => void;
  onOpenTimeOff: (timeOff: TimeOff, column: GridColumn) => void;
  onMove: (block: Block, column: GridColumn, minutes: number) => void;
}) {
  const top = hours.from * 60;
  const height = (hours.to - hours.from) * 60 * PX;
  const columnRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [drag, setDrag] = useState<Drag | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const suppressClick = useRef(false);
  const cleanup = useRef<(() => void) | null>(null);

  useEffect(() => () => cleanup.current?.(), []);

  function setDragState(next: Drag | null) {
    dragRef.current = next;
    setDrag(next);
  }

  /** Column index and start minute for a pointer position, keeping the grab point under the finger. */
  function targetAt(x: number, y: number, current: Drag): { target: number; start: number } {
    const rects = columnRefs.current.map((el) => el?.getBoundingClientRect());
    let target = current.target;
    let best = Infinity;
    rects.forEach((rect, i) => {
      if (!rect) return;
      const distance = x < rect.left ? rect.left - x : x > rect.right ? x - rect.right : 0;
      if (distance < best) {
        best = distance;
        target = i;
      }
    });
    const rect = rects[target];
    const duration = current.block.end - current.block.start;
    const raw = rect ? top + (y - rect.top) / PX - current.grab : current.start;
    const start = Math.max(0, Math.min(24 * 60 - duration, Math.round(raw / DROP_STEP) * DROP_STEP));
    return { target, start };
  }

  function autoScroll(x: number, y: number) {
    const el = scrollerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const edge = 48;
    if (y > r.bottom - edge) el.scrollTop += 14;
    else if (y < r.top + edge + 36) el.scrollTop -= 14;
    if (x > r.right - edge) el.scrollLeft += 14;
    else if (x < r.left + GUTTER + edge / 2) el.scrollLeft -= 14;
  }

  function track(x: number, y: number) {
    const current = dragRef.current;
    if (!current) return;
    autoScroll(x, y);
    const next = targetAt(x, y, current);
    if (next.target !== current.target || next.start !== current.start) setDragState({ ...current, ...next });
  }

  function drop() {
    const current = dragRef.current;
    cleanup.current?.();
    cleanup.current = null;
    setDragState(null);
    if (!current) return;
    const moved = current.target !== current.from || current.start !== current.block.start;
    if (!moved) return;
    suppressClick.current = true;
    setTimeout(() => (suppressClick.current = false), 0);
    onMove(current.block, columns[current.target], current.start);
  }

  function begin(block: Block, from: number, grab: number, touch: boolean) {
    setDragState({ block, from, grab, target: from, start: block.start });
    navigator.vibrate?.(25);
    const listeners: [EventTarget, string, EventListener, AddEventListenerOptions?][] = touch
      ? [
          [
            document,
            "touchmove",
            ((e: TouchEvent) => {
              e.preventDefault(); // keep the page still while a visit is being dragged
              track(e.touches[0].clientX, e.touches[0].clientY);
            }) as EventListener,
            { passive: false },
          ],
          [document, "touchend", drop as EventListener],
          [document, "touchcancel", drop as EventListener],
        ]
      : [
          [window, "pointermove", ((e: PointerEvent) => track(e.clientX, e.clientY)) as EventListener],
          [window, "pointerup", drop as EventListener],
        ];
    for (const [target, type, fn, options] of listeners) target.addEventListener(type, fn, options);
    cleanup.current = () => {
      for (const [target, type, fn] of listeners) target.removeEventListener(type, fn);
    };
  }

  /** Mouse: drag after a small move. Touch: hold, then drag. */
  function onBlockPointerDown(e: React.PointerEvent, block: Block, columnIndex: number) {
    if (block.booking.status !== "confirmed" || (e.pointerType === "mouse" && e.button !== 0)) return;
    const column = columnRefs.current[columnIndex];
    if (!column) return;
    const grab = top + (e.clientY - column.getBoundingClientRect().top) / PX - block.start;
    const startX = e.clientX;
    const startY = e.clientY;
    const touch = e.pointerType === "touch";
    cleanup.current?.();

    let timer: ReturnType<typeof setTimeout> | undefined;
    const stop = () => {
      clearTimeout(timer);
      window.removeEventListener("pointermove", onPendingMove);
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
    };
    const onPendingMove = (ev: PointerEvent) => {
      const distance = Math.hypot(ev.clientX - startX, ev.clientY - startY);
      if (touch && distance > 8) stop(); // a swipe: let the calendar scroll
      if (!touch && distance > 4) {
        stop();
        begin(block, columnIndex, grab, false);
        track(ev.clientX, ev.clientY);
      }
    };
    window.addEventListener("pointermove", onPendingMove);
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
    if (touch) {
      timer = setTimeout(() => {
        stop();
        begin(block, columnIndex, grab, true);
      }, LONG_PRESS_MS);
    }
    cleanup.current = stop;
  }

  const gridColumns = `${GUTTER}px repeat(${Math.max(columns.length, 1)}, minmax(9.5rem, 1fr))`;

  return (
    <div className={`grid min-w-full ${drag ? "select-none" : ""}`} style={{ gridTemplateColumns: gridColumns }}>
      {/* Column titles stay on top while scrolling down. */}
      <div className="sticky top-0 left-0 z-20 border-b border-neutral-200 bg-white" />
      {columns.map((c) => {
        return (
          <div
            key={c.key}
            role={c.onTitleClick ? "button" : undefined}
            onClick={c.onTitleClick}
            className={`sticky top-0 z-10 truncate border-b border-l px-2 py-2 text-center text-sm font-semibold ${
              c.onTitleClick ? "cursor-pointer" : ""
            } ${
              c.titleStyle === "color"
                ? "border-white text-white"
                : c.highlight
                  ? "border-neutral-200 bg-[var(--staff)] text-white"
                  : "border-neutral-200 bg-white text-neutral-800"
            }`}
            style={c.titleStyle === "color" ? { background: c.color } : undefined}
            title={c.title}
          >
            {c.title}
          </div>
        );
      })}

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

      {columns.map((c, index) => (
        <div
          key={c.key}
          ref={(el) => {
            columnRefs.current[index] = el;
          }}
          data-testid={`column-${c.key}`}
          className="relative cursor-pointer border-l border-neutral-200 bg-neutral-100"
          style={{ height }}
          onClick={(e) => {
            if (suppressClick.current) return; // the click that ends a drag
            const y = e.clientY - e.currentTarget.getBoundingClientRect().top;
            onEmpty(c, snapMinutes(top + y / PX));
          }}
        >
          {/* Working time is white, the rest stays grey. */}
          {c.working.map((w) => (
            <div
              key={w.start}
              className="absolute inset-x-0 bg-white"
              style={{
                top: (minutesInDay(w.start, c.date) - top) * PX,
                height: (minutesInDay(w.end, c.date) - minutesInDay(w.start, c.date)) * PX,
              }}
            />
          ))}
          {c.timeOff.map((t) => (
            <button
              key={t.id}
              onClick={(e) => {
                e.stopPropagation();
                onOpenTimeOff(t, c);
              }}
              className="absolute inset-x-0 overflow-hidden px-2 py-1 text-left text-xs text-neutral-600"
              style={{
                top: (minutesInDay(t.start, c.date) - top) * PX,
                height: (minutesInDay(t.end, c.date) - minutesInDay(t.start, c.date)) * PX,
                background: "repeating-linear-gradient(135deg, #e5e5e5 0 6px, #f5f5f5 6px 12px)",
              }}
            >
              {t.reason || "Блокирано"}
            </button>
          ))}
          {/* Hour and half-hour lines. */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{
              backgroundImage: `repeating-linear-gradient(to bottom, #d4d4d4 0 1px, transparent 1px ${30 * PX}px, #ececec ${30 * PX}px ${30 * PX + 1}px, transparent ${30 * PX + 1}px ${60 * PX}px)`,
            }}
          />
          {now.date === c.date && now.minutes >= top && now.minutes <= hours.to * 60 && (
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 z-[5] h-0.5 bg-red-500"
              style={{ top: (now.minutes - top) * PX }}
            />
          )}
          {c.blocks.map((block) => (
            <BookingBlock
              key={block.key}
              block={block}
              color={c.color}
              top={(block.start - top) * PX}
              height={(block.end - block.start) * PX}
              dragging={drag?.block.key === block.key}
              onPointerDown={(e) => onBlockPointerDown(e, block, index)}
              onOpen={() => {
                if (!suppressClick.current) onOpenBooking(block.booking.id);
              }}
            />
          ))}
          {drag && drag.target === index && (
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-0.5 z-20 rounded-[3px] border-2 border-dashed border-neutral-900 px-1.5 py-1 text-white opacity-90 shadow-lg"
              style={{
                top: (drag.start - top) * PX,
                height: (drag.block.end - drag.block.start) * PX,
                background: c.color,
              }}
            >
              <span className="block text-[13px] font-semibold">
                {clockLabel(drag.start)} - {clockLabel(drag.start + drag.block.end - drag.block.start)}
              </span>
              <span className="block truncate text-[14px] font-bold">{drag.block.booking.client.name}</span>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function BookingBlock({
  block,
  color,
  top,
  height,
  dragging,
  onPointerDown,
  onOpen,
}: {
  block: Block;
  color: string;
  top: number;
  height: number;
  dragging: boolean;
  onPointerDown: (e: React.PointerEvent) => void;
  onOpen: () => void;
}) {
  const { booking } = block;
  const width = 100 / block.lanes;
  const noShow = booking.status === "no_show";
  return (
    <button
      onPointerDown={onPointerDown}
      onClick={(e) => {
        e.stopPropagation();
        onOpen();
      }}
      onContextMenu={(e) => e.preventDefault()}
      className={`absolute overflow-hidden rounded-[3px] border border-black/10 px-1.5 py-1 text-left text-white shadow-sm [-webkit-touch-callout:none] ${
        noShow || dragging ? "opacity-40" : ""
      }`}
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
