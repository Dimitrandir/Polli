"use client";

import { ArrowLeft } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useReducer, useRef, useState } from "react";

import { api, ApiError, type Category } from "@/lib/api";
import { initialState, nextStep, previousStep, reducer, type Step } from "@/lib/booking-state";

import { Skeleton } from "../ui/Skeleton";
import { DetailsStep } from "./DetailsStep";
import { DoneStep } from "./DoneStep";
import { ServicesStep } from "./ServicesStep";
import { Stepper } from "./Stepper";
import { MobileBar, Summary } from "./Summary";
import { TimeStep } from "./TimeStep";

export function BookingWizard({
  initialCategories,
  preselect,
}: {
  initialCategories?: Category[];
  /** Id of a service to start with, e.g. from "Запази час" on the services page. */
  preselect?: number;
}) {
  const [state, dispatch] = useReducer(reducer, undefined, () => initialState());
  const [categories, setCategories] = useState<Category[] | null>(initialCategories ?? null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const topRef = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (categories) return;
    api
      .categories()
      .then(setCategories)
      .catch((e: unknown) => setLoadError(e instanceof ApiError ? e.message : String(e)));
  }, [categories]);

  const preselected = useRef(false);
  useEffect(() => {
    if (!categories || !preselect || preselected.current) return;
    preselected.current = true;
    const service = categories
      .flatMap((c) => c.groups.flatMap((g) => g.services))
      .find((s) => s.id === preselect && s.is_online_bookable && s.specialists.length > 0);
    if (service) dispatch({ type: "toggleService", service });
  }, [categories, preselect]);

  const go = useCallback((step: Step) => {
    dispatch({ type: "goTo", step });
    setNotice(null);
    topRef.current?.scrollIntoView({ block: "start" });
  }, []);

  const next = () => go(nextStep(state.step));

  const direction = useRef(1);
  const order: Step[] = ["services", "time", "details", "done"];
  const previousIndex = useRef(0);
  const index = order.indexOf(state.step);
  if (index !== previousIndex.current) {
    direction.current = index > previousIndex.current ? 1 : -1;
    previousIndex.current = index;
  }
  const offset = reduceMotion ? 0 : 40 * direction.current;

  return (
    <div ref={topRef} className="scroll-mt-24">
      {state.step !== "done" && (
        <div className="mb-10 flex items-center gap-4">
          {state.step !== "services" && (
            <button
              onClick={() => go(previousStep(state.step))}
              aria-label="Назад"
              className="grid size-10 shrink-0 place-items-center rounded-full bg-surface text-ink ring-1 ring-line transition hover:ring-accent/60"
            >
              <ArrowLeft className="size-4" />
            </button>
          )}
          <Stepper step={state.step} onJump={go} />
        </div>
      )}

      <div className={state.step === "done" ? "" : "grid gap-10 lg:grid-cols-[minmax(0,1fr)_22rem] xl:gap-14"}>
        <div className="min-w-0 pb-32 lg:pb-0">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={state.step}
              initial={{ opacity: 0, x: offset }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -offset }}
              transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            >
              {state.step === "services" &&
                (categories ? (
                  <ServicesStep categories={categories} state={state} dispatch={dispatch} />
                ) : loadError ? (
                  <p role="alert" className="rounded-2xl bg-surface p-6 text-danger ring-1 ring-line">
                    {loadError}
                  </p>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {Array.from({ length: 6 }, (_, i) => (
                      <Skeleton key={i} className="h-36" />
                    ))}
                  </div>
                ))}
              {state.step === "time" && <TimeStep state={state} dispatch={dispatch} notice={notice} />}
              {state.step === "details" && (
                <DetailsStep
                  state={state}
                  onBooked={(booking) => {
                    dispatch({ type: "booked", booking });
                    topRef.current?.scrollIntoView({ block: "start" });
                  }}
                  onSlotTaken={(message) => {
                    dispatch({ type: "slotTaken" });
                    setNotice(message);
                  }}
                />
              )}
              {state.step === "done" && state.booking && (
                <DoneStep booking={state.booking} onAgain={() => dispatch({ type: "reset" })} />
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        {state.step !== "done" && <Summary state={state} dispatch={dispatch} onNext={next} />}
      </div>

      {state.step !== "done" && <MobileBar state={state} onNext={next} />}
    </div>
  );
}
