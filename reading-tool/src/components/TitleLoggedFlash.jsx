import { useEffect, useRef, useState } from 'react';

// A bit longer than the passage-capture flash since this is a rarer,
// more deliberate action — but should still read as a quick confirmation,
// not linger. (Was 2200ms — cut down per real-device feedback that it hung
// around too long.)
const LOGGED_FADE_MS = 1000;

// Two-phase feedback for the triple-tap "log title" gesture:
// - 'capturing': shown the instant the triple-tap fires, before extraction
//   resolves — just the rectangle, so the gesture feels acknowledged
//   immediately even though we don't know the result yet.
// - 'logged': shown once extraction actually succeeds — the big "Title
//   Logged" label appears and the whole thing fades slowly on its own.
// If extraction fails, the parent just clears this without ever reaching
// 'logged' — a quiet non-event, consistent with how capture failures work.
export default function TitleLoggedFlash({ xMin, xMax, yMin, yMax, containerWidth, containerHeight, phase, onDone }) {
  const [visible, setVisible] = useState(true);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    if (phase !== 'logged') return undefined;
    const fadeStart = setTimeout(() => setVisible(false), 10);
    const timer = setTimeout(() => onDoneRef.current?.(), LOGGED_FADE_MS);
    return () => {
      clearTimeout(fadeStart);
      clearTimeout(timer);
    };
  }, [phase]);

  const top = yMin * containerHeight;
  const left = xMin * containerWidth;
  const height = Math.max(2, (yMax - yMin) * containerHeight);
  const width = Math.max(2, (xMax - xMin) * containerWidth);

  const logged = phase === 'logged';

  return (
    <div
      className="pointer-events-none absolute flex items-center justify-center rounded-md border-2 border-slate-400/80 bg-slate-500/15"
      style={{
        top,
        left,
        width,
        height,
        opacity: logged ? (visible ? 1 : 0) : 1,
        transition: logged ? `opacity ${LOGGED_FADE_MS}ms ease-out` : undefined,
      }}
    >
      {logged && (
        <span className="rounded-lg bg-black/55 px-8 py-4 font-sans text-3xl font-medium tracking-wide text-parchment">
          Title Logged
        </span>
      )}
    </div>
  );
}
