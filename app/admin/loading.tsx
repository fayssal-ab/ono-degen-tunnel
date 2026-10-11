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
