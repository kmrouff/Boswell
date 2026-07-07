import { getTitleCaptureBounds } from '../lib/capture.js';

// The distinct visual state for title capture: corner brackets framing the
// portrait region the title will be read from, plainly different from the
// normal passage-capture view, with an instruction at the top and a cancel
// affordance. Triple-tap / tap-to-type / dictate are handled by the parent.
export default function TitleModeOverlay({ containerWidth, containerHeight, onCancel }) {
  const b = getTitleCaptureBounds();
  const left = b.xMin * containerWidth;
  const top = b.yMin * containerHeight;
  const width = (b.xMax - b.xMin) * containerWidth;
  const height = (b.yMax - b.yMin) * containerHeight;

  const bracket = 28; // px arm length
  const cornerStyle = 'pointer-events-none absolute border-amber-300';

  return (
    <div className="pointer-events-none absolute inset-0 z-10 bg-black/25">
      {/* corner brackets */}
      <div className="absolute" style={{ left, top, width, height }}>
        <div className={`${cornerStyle} border-l-2 border-t-2`} style={{ left: 0, top: 0, width: bracket, height: bracket }} />
        <div className={`${cornerStyle} border-r-2 border-t-2`} style={{ right: 0, top: 0, width: bracket, height: bracket }} />
        <div className={`${cornerStyle} border-l-2 border-b-2`} style={{ left: 0, bottom: 0, width: bracket, height: bracket }} />
        <div className={`${cornerStyle} border-r-2 border-b-2`} style={{ right: 0, bottom: 0, width: bracket, height: bracket }} />
      </div>

      <div className="absolute top-6 left-1/2 -translate-x-1/2 rounded-full bg-amber-300/90 px-4 py-2 text-sm font-medium text-ink">
        Triple-tap to capture title
      </div>

      <button
        type="button"
        onClick={onCancel}
        className="pointer-events-auto absolute top-5 right-4 rounded-full bg-black/60 px-3 py-1.5 text-sm text-parchment"
      >
        Cancel
      </button>
    </div>
  );
}
