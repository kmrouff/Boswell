export default function SelectionBand({ startY, currentY, containerHeight }) {
  if (startY == null || currentY == null) return null;

  const top = Math.min(startY, currentY) * containerHeight;
  const height = Math.abs(currentY - startY) * containerHeight;

  return (
    <div
      className="pointer-events-none absolute left-0 w-full border-y-2 border-parchment/70 bg-parchment/25"
      style={{ top, height }}
    />
  );
}
