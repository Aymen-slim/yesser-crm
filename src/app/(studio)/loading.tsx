export default function Loading() {
  return (
    <div className="animate-pulse" aria-busy="true" aria-label="Loading">
      <div className="mb-3 h-10 w-64 rounded-full bg-track" />
      <div className="mb-8 h-4 w-80 max-w-full rounded-full bg-track" />
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="h-32 rounded-[1.5rem] bg-surface shadow-[0_8px_30px_rgba(0,0,0,0.04)]" />
        ))}
      </div>
      <div className="rounded-[1.5rem] bg-surface p-6 shadow-[0_8px_30px_rgba(0,0,0,0.04)]">
        {Array.from({ length: 6 }, (_, index) => (
          <div key={index} className="mb-4 h-5 rounded-full bg-track last:mb-0" />
        ))}
      </div>
    </div>
  );
}
