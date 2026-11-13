"use client";

import { Keyboard } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal, flushSync } from "react-dom";

import { inputClass } from "./Sheet";

/** Height of one row in a wheel, in px. Five rows are visible, the middle one is the choice. */
const ROW = 44;
const VISIBLE = 5;

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * Turns what was typed into "HH:MM", or null when it is not a time.
 * Accepts "14:30", "14.30", "14 30", "1430", "930", "9" and "14".
 */
export function parseTime(text: string): string | null {
  const t = text.trim();
  let h: number;
  let m: number;
  const parts = t.match(/^(\d{1,2})\s*[:.,\s]\s*(\d{1,2})$/);
  if (parts) {
    h = Number(parts[1]);
    m = Number(parts[2]);
  } else if (/^\d{1,4}$/.test(t)) {
    if (t.length <= 2) {
      h = Number(t);
      m = 0;
    } else {
      h = Number(t.slice(0, t.length - 2));
      m = Number(t.slice(-2));
    }
  } else {
    return null;
  }
  if (h > 23 || m > 59) return null;
  return `${pad(h)}:${pad(m)}`;
}

/**
 * A time field for the staff screens. Tapping it opens two wheels (hours 0–23 and minutes in
 * `step` steps, 24-hour clock) instead of the phone's round clock; the keyboard button in the
 * wheels lets the time be typed instead.
 */
export function TimeField({
  value,
  onChange,
  step = 5,
  title = "Изберете час",
  disabled,
  className,
  ...aria
}: {
  value: string;
  onChange: (value: string) => void;
  step?: number;
  title?: string;
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [typing, setTyping] = useState(false);
  const [text, setText] = useState(value);

  useEffect(() => {
    if (!typing) setText(value);
  }, [value, typing]);

  const commitText = (raw: string) => {
    const parsed = parseTime(raw);
    if (parsed) {
      if (parsed !== value) onChange(parsed);
      setText(parsed);
    } else {
      setText(value);
    }
  };

  const openWheels = () => {
    if (!disabled && !typing) setOpen(true);
  };

  /** Switches to typing: the field gets a numeric keyboard and focus, inside the same tap. */
  const switchToKeyboard = (draft: string) => {
    flushSync(() => {
      setOpen(false);
      setTyping(true);
      setText(draft);
    });
    const input = inputRef.current;
    if (input) {
      input.focus();
      input.select();
    }
  };

  return (
    <>
      <input
        ref={inputRef}
        type="text"
        inputMode={typing ? "numeric" : "none"}
        autoComplete="off"
        enterKeyHint="done"
        placeholder="ЧЧ:ММ"
        readOnly={!typing}
        disabled={disabled}
        aria-label={aria["aria-label"]}
        aria-haspopup="dialog"
        value={text}
        onClick={openWheels}
        onKeyDown={(e) => {
          if (!typing && (e.key === "Enter" || e.key === " " || e.key === "ArrowDown")) {
            e.preventDefault();
            openWheels();
          } else if (typing && e.key === "Enter") {
            e.preventDefault();
            e.currentTarget.blur();
          }
        }}
        onChange={(e) => {
          setText(e.target.value);
          const parsed = parseTime(e.target.value);
          // A full "HH:MM" is taken at once; anything shorter waits for the field to be left.
          if (parsed && /^\d{1,2}[:.]\d{2}$/.test(e.target.value.trim()) && parsed !== value) onChange(parsed);
        }}
        onBlur={(e) => {
          if (typing) {
            commitText(e.target.value);
            setTyping(false);
          }
        }}
        className={`${className ?? inputClass} cursor-pointer tabular-nums ${typing ? "cursor-text" : ""}`}
      />
      {open && (
        <WheelDialog
          title={title}
          value={value}
          step={step}
          onCancel={() => setOpen(false)}
          onDone={(v) => {
            setOpen(false);
            if (v !== value) onChange(v);
          }}
          onKeyboard={switchToKeyboard}
        />
      )}
    </>
  );
}

function WheelDialog({
  title,
  value,
  step,
  onCancel,
  onDone,
  onKeyboard,
}: {
  title: string;
  value: string;
  step: number;
  onCancel: () => void;
  onDone: (value: string) => void;
  onKeyboard: (draft: string) => void;
}) {
  const [h0, m0] = (parseTime(value) ?? "09:00").split(":").map(Number);
  const [hour, setHour] = useState(h0);
  const [minute, setMinute] = useState(m0);

  const hours = useMemo(() => Array.from({ length: 24 }, (_, i) => i), []);
  const minutes = useMemo(() => {
    const list = Array.from({ length: Math.ceil(60 / step) }, (_, i) => i * step).filter((m) => m < 60);
    // A typed time off the step (e.g. 10:07) stays selectable until it is changed.
    if (!list.includes(m0)) list.push(m0);
    return list.sort((a, b) => a - b);
  }, [step, m0]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // Close only the wheels, not the booking form under them.
      e.stopImmediatePropagation();
      onCancel();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onCancel]);

  const draft = `${pad(hour)}:${pad(minute)}`;
  const host = document.querySelector(".staff-app") ?? document.body;

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center sm:p-6">
      <button aria-label="Отказ" tabIndex={-1} className="absolute inset-0 bg-black/40" onClick={onCancel} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative w-full rounded-t-2xl bg-white pb-[env(safe-area-inset-bottom)] shadow-2xl sm:max-w-sm sm:rounded-2xl"
      >
        <div className="px-5 pt-4 text-center">
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">{title}</p>
          <p className="mt-1 text-4xl font-semibold tabular-nums text-neutral-900" aria-live="polite">
            {draft}
          </p>
        </div>

        <div className="relative mx-auto mt-2 flex w-full max-w-xs justify-center gap-2 px-5">
          {/* The band that marks the chosen row, as in the phone's own wheels. */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-5 rounded-xl bg-[var(--staff)]/10 ring-1 ring-[var(--staff)]/30"
            style={{ top: ROW * 2, height: ROW }}
          />
          <Wheel label="Час" items={hours} value={hour} onChange={setHour} />
          <div aria-hidden className="flex items-center text-3xl font-semibold text-neutral-400" style={{ height: ROW * VISIBLE }}>
            :
          </div>
          <Wheel label="Минути" items={minutes} value={minute} onChange={setMinute} />
        </div>

        <div className="mt-3 flex items-center gap-2 border-t border-neutral-200 px-3 py-3">
          <button
            type="button"
            aria-label="Въведи от клавиатурата"
            title="Въведи от клавиатурата"
            onClick={() => onKeyboard(draft)}
            className="rounded-full p-3 text-neutral-600 hover:bg-neutral-100"
          >
            <Keyboard size={22} />
          </button>
          <div className="flex-1" />
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg px-4 py-2.5 font-medium text-neutral-600 hover:bg-neutral-100"
          >
            Отказ
          </button>
          <button
            type="button"
            onClick={() => onDone(draft)}
            className="rounded-lg bg-[var(--staff)] px-5 py-2.5 font-semibold text-white"
          >
            Готово
          </button>
        </div>
      </div>
    </div>,
    host,
  );
}

/** One scrolling column that snaps to a row; the row in the middle is the value. */
function Wheel({
  label,
  items,
  value,
  onChange,
}: {
  label: string;
  items: number[];
  value: number;
  onChange: (value: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const settle = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const index = Math.max(0, items.indexOf(value));

  // Start on the current value without animation.
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = index * ROW;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => () => clearTimeout(settle.current), []);

  const scrollTo = useCallback((i: number) => {
    const el = ref.current;
    if (!el) return;
    if (typeof el.scrollTo === "function") el.scrollTo({ top: i * ROW, behavior: "smooth" });
    else el.scrollTop = i * ROW;
  }, []);

  const pick = (i: number) => {
    const clamped = Math.min(items.length - 1, Math.max(0, i));
    onChange(items[clamped]);
    scrollTo(clamped);
  };

  const onScroll = () => {
    const el = ref.current;
    if (!el) return;
    const i = Math.min(items.length - 1, Math.max(0, Math.round(el.scrollTop / ROW)));
    if (items[i] !== value) onChange(items[i]);
    // Once the finger lets go, line the row up exactly (for browsers without scroll snapping).
    clearTimeout(settle.current);
    settle.current = setTimeout(() => {
      if (ref.current && Math.abs(ref.current.scrollTop - i * ROW) > 1) scrollTo(i);
    }, 150);
  };

  return (
    <div
      ref={ref}
      role="listbox"
      aria-label={label}
      tabIndex={0}
      onScroll={onScroll}
      onKeyDown={(e) => {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          pick(index + 1);
        } else if (e.key === "ArrowUp") {
          e.preventDefault();
          pick(index - 1);
        }
      }}
      className="relative w-20 snap-y snap-mandatory overflow-y-auto overscroll-contain rounded-xl outline-none [scrollbar-width:none] focus-visible:ring-2 focus-visible:ring-[var(--staff)]/40 [&::-webkit-scrollbar]:hidden"
      style={{
        height: ROW * VISIBLE,
        paddingTop: ROW * 2,
        paddingBottom: ROW * 2,
        maskImage: "linear-gradient(to bottom, transparent, black 30%, black 70%, transparent)",
        WebkitMaskImage: "linear-gradient(to bottom, transparent, black 30%, black 70%, transparent)",
      }}
    >
      {items.map((n, i) => (
        <div
          key={n}
          role="option"
          aria-selected={i === index}
          onClick={() => pick(i)}
          className={`flex snap-center items-center justify-center tabular-nums transition-colors ${
            i === index ? "text-3xl font-semibold text-neutral-900" : "text-2xl text-neutral-400"
          }`}
          style={{ height: ROW }}
        >
          {pad(n)}
        </div>
      ))}
    </div>
  );
}
