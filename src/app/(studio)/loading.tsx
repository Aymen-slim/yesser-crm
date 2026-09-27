export default function Loading() {
  return (
    <div className="animate-pulse" aria-busy="true" aria-label="Loading">
      <div className="mb-3 h-8 w-56 rounded-lg bg-stone-200" />
      <div className="mb-8 h-4 w-80 max-w-full rounded bg-stone-200/70" />
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="h-24 rounded-xl border border-line bg-surface" />
        ))}
      </div>
      <div className="rounded-xl border border-line bg-surface p-5">
        {Array.from({ length: 6 }, (_, index) => (
          <div key={index} className="mb-4 h-5 rounded bg-stone-100 last:mb-0" />
        ))}
      </div>
    </div>
  );
}
