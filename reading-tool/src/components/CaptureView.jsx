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
  getTitleCaptureBounds,
  VISUAL_BUFFER_RATIO,
} from '../lib/capture.js';
import { extractPassage, extractTitle } from '../lib/claude.js';
import { savePassage, deletePassage, getCurrentSourceTitle, setCurrentSourceTitle } from '../lib/storage.js';

const HINT_DISMISSED_KEY = 'capture_hint_dismissed';

// Triple-tap gesture (logs the title): three taps in a row, each within this
// window of the previous and this close in position, with no hold required.
// A plain tap-tap-tap rather than a hold sidesteps iOS/Android's native
// long-press text-selection/magnifier UI, which a sustained hold triggers.
const TRIPLE_TAP_WINDOW_MS = 400;
const TRIPLE_TAP_POSITION_THRESHOLD = 0.08;

export default function CaptureView() {
  const videoRef = useRef(null);
  const containerRef = useRef(null);
  const touchPathRef = useRef([]);
  const startTimeRef = useRef(0);
  const tapHistoryRef = useRef([]); // most recent taps (oldest first), max length 2

  const [cameraError, setCameraError] = useState(null);
  const [dragBounds, setDragBounds] = useState(null);
  const [captureBounds, setCaptureBounds] = useState(null);
  const [titleCapture, setTitleCapture] = useState(null); // { bounds, phase: 'capturing' | 'logged' }
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
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          // Explicit play() rather than relying solely on the autoPlay
          // attribute — some mobile browsers show a transient native
          // play/pause affordance when they have to resume playback
          // themselves; calling play() ourselves avoids that.
          await videoRef.current.play().catch(() => {});
        }
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

  // Triple-tap on a title page: captures a fixed, centered, book-page-shaped
  // (portrait) rectangle and uses the extracted text as the "currently
  // logged" source title, tagged onto every passage saved from here on.
  const handleTitleLogTripleTap = async () => {
    navigator.vibrate?.([10, 40, 10, 40, 10]);
    const bounds = getTitleCaptureBounds();
    // Shown immediately so the gesture feels acknowledged right away, even
    // though we don't know the extraction result yet.
    setTitleCapture({ bounds, phase: 'capturing' });

    if (!videoRef.current || videoRef.current.readyState < 2) {
      setTitleCapture(null);
      return;
    }
    const dataUrl = cropVideoFrame(videoRef.current, bounds);
    const result = await extractTitle(dataUrl);
    if (result.error) {
      setTitleCapture(null);
      return;
    }

    const title = (result.title || '').trim();
    if (!title) {
      setTitleCapture(null);
      return;
    }
    setCurrentSourceTitle(title);
    // Only now does the big "Title Logged" confirmation appear and fade.
    setTitleCapture((prev) => (prev ? { ...prev, phase: 'logged' } : null));
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
  };

  const handleTouchMove = (e) => {
    const touch = e.touches[0];
    const rect = containerRef.current.getBoundingClientRect();
    const point = normalizePoint(touch.clientX, touch.clientY, rect);
    touchPathRef.current.push({ ...point, t: performance.now() - startTimeRef.current });
    const ys = touchPathRef.current.map((p) => p.y);
    setDragBounds({ min: Math.min(...ys), max: Math.max(...ys) });
  };

  const handleTouchEnd = () => {
    navigator.vibrate?.(10);
    setDragBounds(null);

    const path = touchPathRef.current;
    touchPathRef.current = [];

    if (!isMeaningfulDrag(path)) {
      const now = performance.now();
      const tap = { time: now, x: path[0].x, y: path[0].y };
      // Drop any prior taps too old to still combo with this one.
      const recent = tapHistoryRef.current.filter((t) => now - t.time < TRIPLE_TAP_WINDOW_MS);
      const closeToAll = recent.every(
        (t) =>
          Math.abs(t.x - tap.x) < TRIPLE_TAP_POSITION_THRESHOLD &&
          Math.abs(t.y - tap.y) < TRIPLE_TAP_POSITION_THRESHOLD
      );

      if (recent.length === 2 && closeToAll) {
        tapHistoryRef.current = [];
        handleTitleLogTripleTap();
      } else if (closeToAll) {
        tapHistoryRef.current = [...recent, tap];
      } else {
        tapHistoryRef.current = [tap];
      }
      return;
    }
    tapHistoryRef.current = [];

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
        disablePictureInPicture
        className="h-full w-full object-cover"
      />

      <div
        ref={containerRef}
        className="absolute inset-0 touch-none select-none [-webkit-touch-callout:none]"
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

        {containerRef.current && titleCapture && (
          <TitleLoggedFlash
            xMin={titleCapture.bounds.xMin}
            xMax={titleCapture.bounds.xMax}
            yMin={titleCapture.bounds.yMin}
            yMax={titleCapture.bounds.yMax}
            containerWidth={containerRef.current.clientWidth}
            containerHeight={containerRef.current.clientHeight}
            phase={titleCapture.phase}
            onDone={() => setTitleCapture(null)}
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
