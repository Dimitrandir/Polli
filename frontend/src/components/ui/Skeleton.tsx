import clsx from "clsx";

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={clsx("animate-pulse rounded-2xl bg-surface-2", className)} />;
}
