import { useEffect, useRef, useState } from 'react';
import { FADE_DURATION_MS } from './MarginTicks.jsx';

// Flash + faint "Title Logged" label shown over the region captured by the
// double-tap-and-hold gesture, fading out on its own like CaptureFlash.
export default function TitleLoggedFlash({ yMin, yMax, containerHeight, onDone }) {
  const [visible, setVisible] = useState(true);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
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
      className="pointer-events-none absolute left-0 flex w-full items-center justify-center border-y-2 border-slate-500/70 bg-slate-500/20"
      style={{ top, height, opacity: visible ? 1 : 0, transition: `opacity ${FADE_DURATION_MS}ms ease-out` }}
    >
      <span className="rounded-full bg-black/50 px-3 py-1 text-xs tracking-wide text-parchment/80">
        Title Logged
      </span>
    </div>
  );
}
