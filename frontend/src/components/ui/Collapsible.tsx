"use client";

import clsx from "clsx";
import { ChevronDown } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { type ReactNode, useId } from "react";

/**
 * A card whose header is a button that shows or hides the content below it.
 * The header goes inside the button, so it must be inline content (spans).
 */
export function Collapsible({
  open,
  onToggle,
  header,
  children,
  className,
}: {
  open: boolean;
  onToggle: () => void;
  header: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const contentId = useId();
  return (
    <div className={className}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={contentId}
        className="group flex w-full items-start gap-4 text-left"
      >
        <span className="block min-w-0 flex-1">{header}</span>
        <span
          className={clsx(
            "mt-1 grid size-9 shrink-0 place-items-center rounded-full bg-surface-2 text-ink transition-all duration-300 group-hover:bg-ink group-hover:text-bg",
            open && "rotate-180",
          )}
        >
          <ChevronDown className="size-4" strokeWidth={2.5} />
        </span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            id={contentId}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="overflow-hidden"
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
