// Shown by the App Router while a (site) route's data loads — a clean spinning
// conic ring instead of a blank flash.
export default function Loading() {
  return (
    <div className="grid min-h-[60vh] place-items-center">
      <div className="flex flex-col items-center gap-4">
        <div className="route-spinner" />
        <p className="label">Loading</p>
      </div>
    </div>
  );
}
