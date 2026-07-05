import { useEffect, useRef, useState } from 'react';
import SelectionBand from './SelectionBand.jsx';
import { normalizePoint, isMeaningfulDrag, computeSelectionBounds, cropVideoFrame } from '../lib/capture.js';

const HINT_DISMISSED_KEY = 'capture_hint_dismissed';

export default function CaptureView() {
  const videoRef = useRef(null);
  const containerRef = useRef(null);
  const touchPathRef = useRef([]);
  const startTimeRef = useRef(0);

  const [cameraError, setCameraError] = useState(null);
  const [bandBounds, setBandBounds] = useState(null);
  const [lastCapture, setLastCapture] = useState(null);
  const [hintDismissed, setHintDismissed] = useState(
    () => localStorage.getItem(HINT_DISMISSED_KEY) === 'true'
  );

  useEffect(() => {
    let stream;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
        });
        if (videoRef.current) videoRef.current.srcObject = stream;
      } catch (err) {
        setCameraError(err);
      }
    })();
    return () => stream?.getTracks().forEach((t) => t.stop());
  }, []);

  const dismissHint = () => {
    localStorage.setItem(HINT_DISMISSED_KEY, 'true');
    setHintDismissed(true);
  };

  const handleTouchStart = (e) => {
    const touch = e.touches[0];
    const rect = containerRef.current.getBoundingClientRect();
    const point = normalizePoint(touch.clientX, touch.clientY, rect);
    startTimeRef.current = performance.now();
    touchPathRef.current = [{ ...point, t: 0 }];
    setBandBounds({ min: point.y, max: point.y });
    navigator.vibrate?.(10);
    if (!hintDismissed) dismissHint();
  };

  const handleTouchMove = (e) => {
    const touch = e.touches[0];
    const rect = containerRef.current.getBoundingClientRect();
    const point = normalizePoint(touch.clientX, touch.clientY, rect);
    touchPathRef.current.push({ ...point, t: performance.now() - startTimeRef.current });
    const ys = touchPathRef.current.map((p) => p.y);
    setBandBounds({ min: Math.min(...ys), max: Math.max(...ys) });
  };

  const handleTouchEnd = () => {
    navigator.vibrate?.(10);
    setBandBounds(null);

    const path = touchPathRef.current;
    touchPathRef.current = [];

    if (!isMeaningfulDrag(path)) return;
    if (!videoRef.current || videoRef.current.readyState < 2) return;

    const selectionBounds = computeSelectionBounds(path);
    const dataUrl = cropVideoFrame(videoRef.current, selectionBounds);
    setLastCapture({ dataUrl, selectionBounds, touchPath: path });
  };

  return (
    <div className="relative h-full w-full overflow-hidden bg-black">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="h-full w-full object-cover"
      />

      <div
        ref={containerRef}
        className="absolute inset-0 touch-none"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {containerRef.current && bandBounds && (
          <SelectionBand
            startY={bandBounds.min}
            currentY={bandBounds.max}
            containerHeight={containerRef.current.clientHeight}
          />
        )}
      </div>

      {cameraError && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-ink p-6 text-center text-parchment">
          <p className="font-medium">Camera access is needed to capture passages.</p>
          <p className="text-sm text-parchment/60">
            Please allow camera access in your browser's site settings, then reload this page.
          </p>
        </div>
      )}

      {!hintDismissed && !cameraError && (
        <div className="absolute top-6 left-1/2 -translate-x-1/2 rounded-full bg-black/60 px-4 py-2 text-sm text-parchment">
          Drag down over text to capture
        </div>
      )}

      {lastCapture && (
        <div className="absolute inset-x-0 bottom-0 max-h-[45%] overflow-y-auto bg-ink/95 p-3">
          <div className="mb-2 flex items-center justify-between text-xs text-parchment/60">
            <span>Debug: last crop (Phase 2 — not yet sent anywhere)</span>
            <button
              type="button"
              className="text-parchment/60 underline"
              onClick={() => setLastCapture(null)}
            >
              Dismiss
            </button>
          </div>
          <img
            src={lastCapture.dataUrl}
            alt="Cropped selection"
            className="w-full rounded border border-parchment/20"
          />
        </div>
      )}
    </div>
  );
}
