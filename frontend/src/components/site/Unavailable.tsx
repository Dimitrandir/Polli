export function Unavailable({ what }: { what: string }) {
  return (
    <p className="rounded-2xl bg-surface-2 p-6 text-ink-soft">
      {what} не могат да се заредят в момента. Моля, опитайте отново след малко.
    </p>
  );
}
