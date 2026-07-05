import { useEffect, useRef, useState } from 'react';
import { FADE_DURATION_MS } from './MarginTicks.jsx';

// A brief translucent band across the captured region that flashes in, then
// fades out on its own — visual confirmation of what was just captured,
// without staying on screen and getting in the way of reading.
export default function CaptureFlash({ yMin, yMax, containerHeight, onDone }) {
  const [visible, setVisible] = useState(true);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    // Empty deps: this timer should start once on mount and run to
    // completion, not restart if the parent re-renders (e.g. a new drag
    // starting elsewhere) and passes a new inline onDone closure.
    // A short setTimeout (rather than requestAnimationFrame) kicks off the
    // fade — rAF can be throttled to near-zero in backgrounded/inactive tabs,
    // which would let the unmount timer below fire before any transition plays.
    const fadeStart = setTimeout(() => setVisible(false), 10);
    const timer = setTimeout(() => onDoneRef.current?.(), FADE_DURATION_MS);
    return () => {
      clearTimeout(fadeStart);
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const top = yMin * containerHeight;
  const height = Math.max(2, (yMax - yMin) * containerHeight);

  return (
    <div
      className="pointer-events-none absolute left-0 w-full border-y-2 border-parchment/70 bg-parchment/25"
      style={{ top, height, opacity: visible ? 1 : 0, transition: `opacity ${FADE_DURATION_MS}ms ease-out` }}
    />
  );
}
