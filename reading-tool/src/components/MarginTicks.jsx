import { useEffect, useRef, useState } from 'react';

const MARGIN_INSET_PCT = 8;
const TICK_LENGTH_PCT = 5;
export const FADE_DURATION_MS = 550;

// Bracket-style tick marks confined to the left/right margins, marking the
// vertical extent of a drag without covering the text in the middle.
// While `fading` is true, it fades itself out and calls onFadeComplete once done.
export default function MarginTicks({ yMin, yMax, containerHeight, fading = false, onFadeComplete }) {
  const [opacity, setOpacity] = useState(1);
  const onFadeCompleteRef = useRef(onFadeComplete);
  onFadeCompleteRef.current = onFadeComplete;

  useEffect(() => {
    if (!fading) return undefined;
    // setTimeout rather than requestAnimationFrame — see CaptureFlash.jsx for why.
    // Deps intentionally exclude onFadeComplete (kept in a ref instead) so an
    // unrelated parent re-render can't restart this timer mid-fade.
    const fadeStart = setTimeout(() => setOpacity(0), 10);
    const timer = setTimeout(() => onFadeCompleteRef.current?.(), FADE_DURATION_MS);
    return () => {
      clearTimeout(fadeStart);
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fading]);

  if (yMin == null || yMax == null) return null;

  const top = yMin * containerHeight;
  const height = Math.max(2, (yMax - yMin) * containerHeight);
  const fadeStyle = fading
    ? { transition: `opacity ${FADE_DURATION_MS}ms ease-out`, opacity }
    : { opacity: 1 };

  const Bracket = ({ side }) => (
    <>
      <div
        className="pointer-events-none absolute w-0.5 bg-slate-700/90"
        style={{ ...fadeStyle, [side]: `${MARGIN_INSET_PCT}%`, top, height }}
      />
      <div
        className="pointer-events-none absolute h-0.5 bg-slate-700/90"
        style={{ ...fadeStyle, [side]: `${MARGIN_INSET_PCT - TICK_LENGTH_PCT}%`, width: `${TICK_LENGTH_PCT}%`, top }}
      />
      <div
        className="pointer-events-none absolute h-0.5 bg-slate-700/90"
        style={{ ...fadeStyle, [side]: `${MARGIN_INSET_PCT - TICK_LENGTH_PCT}%`, width: `${TICK_LENGTH_PCT}%`, top: top + height }}
      />
    </>
  );

  return (
    <>
      <Bracket side="left" />
      <Bracket side="right" />
    </>
  );
}
