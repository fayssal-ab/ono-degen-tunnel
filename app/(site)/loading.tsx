// Default route skeleton — matches the usual page rhythm (header block + grid).
export default function Loading() {
  return (
    <div className="animate-pulse space-y-6" aria-hidden>
      <div className="surface h-48" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="surface h-40" />
        ))}
      </div>
    </div>
  );
}
