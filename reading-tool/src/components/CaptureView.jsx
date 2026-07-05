import { useEffect, useRef, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import MarginTicks from './MarginTicks.jsx';
import CaptureFlash from './CaptureFlash.jsx';
import TitleLoggedFlash from './TitleLoggedFlash.jsx';
import UndoToast from './UndoToast.jsx';
import {
  normalizePoint,
  isMeaningfulDrag,
  computeSelectionBounds,
  cropVideoFrame,
  createThumbnail,
  VISUAL_BUFFER_RATIO,
  TITLE_CAPTURE_HALF_HEIGHT,
} from '../lib/capture.js';
import { extractPassage } from '../lib/claude.js';
import { savePassage, deletePassage, getCurrentSourceTitle, setCurrentSourceTitle } from '../lib/storage.js';

const HINT_DISMISSED_KEY = 'capture_hint_dismissed';

// Double-tap-and-hold gesture (logs the title) tuning: a second touch must
// land within this window and this close to the first tap's position, and
// then be held for the hold duration to count.
const DOUBLE_TAP_WINDOW_MS = 300;
const HOLD_DURATION_MS = 450;
// How close the second tap needs to land to the first — generous, since two
// deliberate taps in quick succession rarely land on the exact same pixel.
const DOUBLE_TAP_POSITION_THRESHOLD = 0.08;
// How much the finger can drift *during* the hold before it's treated as the
// start of a drag instead. A held finger naturally wobbles more than a tap
// lands off-target, so this is intentionally looser than the threshold above.
const HOLD_MOVE_CANCEL_THRESHOLD = 0.12;

export default function CaptureView() {
  const videoRef = useRef(null);
  const containerRef = useRef(null);
  const touchPathRef = useRef([]);
  const startTimeRef = useRef(0);
  const pendingTapRef = useRef(null);
  const holdTimerRef = useRef(null);
  const holdTriggeredRef = useRef(false);

  const [cameraError, setCameraError] = useState(null);
  const [dragBounds, setDragBounds] = useState(null);
  const [captureBounds, setCaptureBounds] = useState(null);
  const [titleBounds, setTitleBounds] = useState(null);
  const [toasts, setToasts] = useState([]);
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

  const pushToast = (message, onUndo) => {
    setToasts((prev) => [...prev, { id: uuidv4(), message, onUndo }]);
  };

  const removeToast = (id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  // Async and non-blocking by design: the UI already returned to ready state
  // by the time this runs, and multiple of these can be in flight at once if
  // the user gestures again quickly — each resolves into its own passage.
  const performCapture = async (path) => {
    const selectionBounds = computeSelectionBounds(path);
    const dataUrl = cropVideoFrame(videoRef.current, selectionBounds);
    // Grab the active title now, not whenever extraction resolves, so a
    // title logged mid-flight doesn't retroactively relabel this passage.
    const sourceTitle = getCurrentSourceTitle();

    setCaptureBounds(computeSelectionBounds(path, VISUAL_BUFFER_RATIO));

    const result = await extractPassage(dataUrl);

    if (result.error) {
      pushToast("Couldn't read that — try again");
      return;
    }

    const imageThumb = await createThumbnail(dataUrl).catch(() => null);

    const passage = {
      id: uuidv4(),
      capturedAt: new Date().toISOString(),
      rawText: result.rawText,
      refinedText: result.refinedText,
      context: result.context,
      pageNumber: result.pageNumber ?? null,
      sourceTitle,
      touchPath: path,
      selectionBounds,
      isMerged: false,
      mergedFromIds: [],
      imageThumb,
      audioNote: null,
      audioTranscript: null,
    };

    savePassage(passage);
    window.dispatchEvent(new CustomEvent('passage-saved', { detail: { id: passage.id } }));
    pushToast('Captured', () => deletePassage(passage.id));
  };

  // Double-tap-and-hold on a title page: captures a small band around the
  // touch point and uses the extracted text as the "currently logged"
  // source title, tagged onto every passage saved from here on.
  const handleTitleLogHold = async (point) => {
    navigator.vibrate?.([10, 40, 10]);
    const bounds = {
      yMin: Math.max(0, point.y - TITLE_CAPTURE_HALF_HEIGHT),
      yMax: Math.min(1, point.y + TITLE_CAPTURE_HALF_HEIGHT),
    };
    setTitleBounds(bounds);

    if (!videoRef.current || videoRef.current.readyState < 2) return;
    const dataUrl = cropVideoFrame(videoRef.current, bounds);
    const result = await extractPassage(dataUrl);
    if (result.error) return;

    const title = (result.refinedText || result.rawText || '').trim();
    if (title) setCurrentSourceTitle(title);
  };

  const handleTouchStart = (e) => {
    const touch = e.touches[0];
    const rect = containerRef.current.getBoundingClientRect();
    const point = normalizePoint(touch.clientX, touch.clientY, rect);
    startTimeRef.current = performance.now();
    touchPathRef.current = [{ ...point, t: 0 }];
    setDragBounds({ min: point.y, max: point.y });
    navigator.vibrate?.(10);
    if (!hintDismissed) dismissHint();

    holdTriggeredRef.current = false;
    const prevTap = pendingTapRef.current;
    pendingTapRef.current = null;
    if (
      prevTap &&
      performance.now() - prevTap.time < DOUBLE_TAP_WINDOW_MS &&
      Math.abs(point.x - prevTap.x) < DOUBLE_TAP_POSITION_THRESHOLD &&
      Math.abs(point.y - prevTap.y) < DOUBLE_TAP_POSITION_THRESHOLD
    ) {
      holdTimerRef.current = setTimeout(() => {
        holdTimerRef.current = null;
        holdTriggeredRef.current = true;
        handleTitleLogHold(point);
      }, HOLD_DURATION_MS);
    }
  };

  const handleTouchMove = (e) => {
    const touch = e.touches[0];
    const rect = containerRef.current.getBoundingClientRect();
    const point = normalizePoint(touch.clientX, touch.clientY, rect);
    touchPathRef.current.push({ ...point, t: performance.now() - startTimeRef.current });
    const ys = touchPathRef.current.map((p) => p.y);
    setDragBounds({ min: Math.min(...ys), max: Math.max(...ys) });

    if (holdTimerRef.current) {
      const origin = touchPathRef.current[0];
      const moved =
        Math.abs(point.x - origin.x) > HOLD_MOVE_CANCEL_THRESHOLD ||
        Math.abs(point.y - origin.y) > HOLD_MOVE_CANCEL_THRESHOLD;
      if (moved) {
        clearTimeout(holdTimerRef.current);
        holdTimerRef.current = null;
      }
    }
  };

  const handleTouchEnd = () => {
    navigator.vibrate?.(10);
    setDragBounds(null);

    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }

    const path = touchPathRef.current;
    touchPathRef.current = [];

    if (holdTriggeredRef.current) return;

    if (!isMeaningfulDrag(path)) {
      pendingTapRef.current = { time: performance.now(), x: path[0].x, y: path[0].y };
      return;
    }
    pendingTapRef.current = null;

    if (!videoRef.current || videoRef.current.readyState < 2) return;

    performCapture(path);
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
        {containerRef.current && dragBounds && (
          <MarginTicks
            yMin={dragBounds.min}
            yMax={dragBounds.max}
            containerHeight={containerRef.current.clientHeight}
          />
        )}

        {containerRef.current && captureBounds && (
          <>
            <MarginTicks
              yMin={captureBounds.yMin}
              yMax={captureBounds.yMax}
              containerHeight={containerRef.current.clientHeight}
              fading
            />
            <CaptureFlash
              yMin={captureBounds.yMin}
              yMax={captureBounds.yMax}
              containerHeight={containerRef.current.clientHeight}
              onDone={() => setCaptureBounds(null)}
            />
          </>
        )}

        {containerRef.current && titleBounds && (
          <TitleLoggedFlash
            yMin={titleBounds.yMin}
            yMax={titleBounds.yMax}
            containerHeight={containerRef.current.clientHeight}
            onDone={() => setTitleBounds(null)}
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
        <div className="absolute top-6 left-1/2 flex -translate-x-1/2 flex-col items-center gap-2 text-center">
          <div className="rounded-full bg-black/60 px-4 py-2 text-sm text-parchment">
            Drag down over text to capture
          </div>
          <div className="rounded-full bg-black/60 px-4 py-2 text-xs text-parchment/80">
            Don't forget to log the title of the text to help you find it later :)
          </div>
        </div>
      )}

      <UndoToast toasts={toasts} onDismiss={removeToast} />
    </div>
  );
}
