import { useEffect, useRef, useState } from 'react';

const MARGIN_INSET_PCT = 8;
export const FADE_DURATION_MS = 550;

// Vertical lines confined to the left/right margins, marking the vertical
// extent of a drag without covering the text in the middle. Amber, matching
// the rest of the capture-mode camera chrome (TitleModeOverlay's corner
// brackets) — chosen over the earlier dark slate for real-world contrast
// against a live camera feed, per real-device feedback that the ticks were
// hard to see.
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

  const Tick = ({ side }) => (
    <div
      className="pointer-events-none absolute w-1 rounded-full bg-amber-300 shadow-[0_0_4px_rgba(0,0,0,.5)]"
      style={{ ...fadeStyle, [side]: `${MARGIN_INSET_PCT}%`, top, height }}
    />
  );

  return (
    <>
      <Tick side="left" />
      <Tick side="right" />
    </>
  );
}
