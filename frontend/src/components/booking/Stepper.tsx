"use client";

import clsx from "clsx";
import { Check } from "lucide-react";
import { motion } from "motion/react";

import { STEPS, type Step } from "@/lib/booking-state";

export function Stepper({ step, onJump }: { step: Step; onJump: (step: Step) => void }) {
  const current = STEPS.findIndex((s) => s.id === step);
  return (
    <nav aria-label="Стъпки" className="w-full">
      <ol className="flex items-center gap-2 sm:gap-3">
        {STEPS.map((s, i) => {
          const done = i < current;
          const active = i === current;
          return (
            <li key={s.id} className="flex flex-1 items-center gap-2 sm:gap-3">
              <button
                disabled={!done}
                onClick={() => onJump(s.id)}
                aria-current={active ? "step" : undefined}
                className="flex items-center gap-2 disabled:cursor-default"
              >
                <span
                  className={clsx(
                    "grid size-7 shrink-0 place-items-center rounded-full text-xs font-bold transition-colors",
                    active && "bg-ink text-bg",
                    done && "bg-accent text-accent-ink",
                    !active && !done && "bg-surface-2 text-ink-soft",
                  )}
                >
                  {done ? <Check className="size-3.5" strokeWidth={3} /> : i + 1}
                </span>
                <span
                  className={clsx(
                    "hidden text-sm font-semibold md:inline",
                    active ? "text-ink" : "text-ink-soft",
                  )}
                >
                  {s.label}
                </span>
              </button>
              {i < STEPS.length - 1 && (
                <span className="relative h-px flex-1 overflow-hidden bg-line">
                  <motion.span
                    className="absolute inset-y-0 left-0 bg-accent"
                    initial={false}
                    animate={{ width: done ? "100%" : "0%" }}
                    transition={{ duration: 0.4 }}
                  />
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
