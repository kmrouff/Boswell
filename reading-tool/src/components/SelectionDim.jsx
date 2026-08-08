import { useEffect, useState } from 'react';

// How dark the un-selected part of the frame gets, and how quickly it gets
// there. Fast enough to feel like a direct response to the finger going
// down rather than an animation playing.
const DIM_OPACITY = 0.55;
export const DIM_FADE_IN_MS = 130;

// Height of the soft edge either side of the selection, in px. Without it
// the dim meets the clear band on a hard line, which reads as a UI panel
// sitting on top of the page rather than as light falling on it.
const FEATHER_PX = 22;

// Darkens everything outside the current drag selection, leaving the
// selected band at full clarity — the page shows through exactly where the
// user is dragging and dims away above and below it. Rendered underneath
// MarginTicks so the ticks stay crisp on top, and pointer-events-none
// throughout so it can never intercept the drag it is describing.
export default function SelectionDim({ yMin, yMax, containerHeight }) {
  const [lit, setLit] = useState(false);

  useEffect(() => {
    // setTimeout rather than requestAnimationFrame, for the same reason as
    // CaptureFlash: rAF can be throttled to nothing in an inactive tab,
    // which would skip the transition entirely and make the dim snap in.
    const t = setTimeout(() => setLit(true), 10);
    return () => clearTimeout(t);
  }, []);

  if (yMin == null || yMax == null) return null;

  const topHeight = Math.max(0, yMin * containerHeight);
  const bottomTop = yMax * containerHeight;
  const bottomHeight = Math.max(0, containerHeight - bottomTop);

  const shared = {
    opacity: lit ? 1 : 0,
    transition: `opacity ${DIM_FADE_IN_MS}ms ease-out`,
  };

  return (
    <>
      <div
        className="pointer-events-none absolute left-0 w-full"
        style={{
          ...shared,
          top: 0,
          height: topHeight,
          // Fades to transparent at the selection edge, so the clear band
          // opens out of the dim rather than being cut into it.
          background: `linear-gradient(to bottom, rgba(0,0,0,${DIM_OPACITY}) calc(100% - ${FEATHER_PX}px), rgba(0,0,0,0) 100%)`,
        }}
      />
      <div
        className="pointer-events-none absolute left-0 w-full"
        style={{
          ...shared,
          top: bottomTop,
          height: bottomHeight,
          background: `linear-gradient(to top, rgba(0,0,0,${DIM_OPACITY}) calc(100% - ${FEATHER_PX}px), rgba(0,0,0,0) 100%)`,
        }}
      />
    </>
  );
}
