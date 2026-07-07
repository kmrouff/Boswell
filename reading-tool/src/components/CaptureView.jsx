import { useEffect, useRef, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import MarginTicks from './MarginTicks.jsx';
import CaptureFlash from './CaptureFlash.jsx';
import TitleLoggedFlash from './TitleLoggedFlash.jsx';
import UndoToast from './UndoToast.jsx';
import VoiceRecordButton from './VoiceRecordButton.jsx';
import {
  normalizePoint,
  isMeaningfulDrag,
  computeSelectionBounds,
  cropVideoFrame,
  getTitleCaptureBounds,
  rawBoundsOf,
  bufferOverlapChop,
  cropImageRegion,
  VISUAL_BUFFER_RATIO,
} from '../lib/capture.js';
import { extractPassage, extractTitle } from '../lib/claude.js';
import {
  savePassage,
  deletePassage,
  getPassage,
  getPassages,
  updatePassage,
  getCurrentSourceTitle,
  setCurrentSourceTitle,
} from '../lib/storage.js';
import { maybeMergeWithPrevious } from '../lib/continuation.js';
import { startRecording } from '../lib/audio.js';

const HINT_DISMISSED_KEY = 'capture_hint_dismissed';

// Triple-tap gesture (logs the title): three taps in a row, each within this
// window of the previous and this close in position, with no hold required.
// A plain tap-tap-tap rather than a hold sidesteps iOS/Android's native
// long-press text-selection/magnifier UI, which a sustained hold triggers.
const TRIPLE_TAP_WINDOW_MS = 400;
const TRIPLE_TAP_POSITION_THRESHOLD = 0.08;

// How long a capture stays "recent" for buffer-overlap de-duplication. The
// chop assumes the camera hasn't moved between the two captures (a static
// reading view), so it only compares against captures made moments ago.
const RECENT_CAPTURE_WINDOW_MS = 20000;
const MAX_RECENT_CAPTURES = 4;

export default function CaptureView() {
  const videoRef = useRef(null);
  const containerRef = useRef(null);
  const touchPathRef = useRef([]);
  const startTimeRef = useRef(0);
  const tapHistoryRef = useRef([]); // most recent taps (oldest first), max length 2
  const recorderRef = useRef(null);
  // Recent captures kept transiently in memory (not storage) for buffer-overlap
  // de-duplication: { rawBounds, cropBounds, cropDataUrl, savedPromise, tMs }.
  const recentCapturesRef = useRef([]);

  const [cameraError, setCameraError] = useState(null);
  const [dragBounds, setDragBounds] = useState(null);
  const [captureBounds, setCaptureBounds] = useState(null);
  const [titleCapture, setTitleCapture] = useState(null); // { bounds, phase: 'capturing' | 'logged' }
  const [toasts, setToasts] = useState([]);
  const [isRecording, setIsRecording] = useState(false);
  const [hasPassages, setHasPassages] = useState(() => getPassages().length > 0);
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

  // Retroactively trims a previous capture's overlapping buffer once a later
  // capture reveals where the two should meet, so the shared region isn't
  // extracted into both passages. Re-crops the previous capture's retained
  // image (no re-touching the camera) and re-extracts it. Fire-and-forget and
  // fully guarded: any failure leaves the previous passage exactly as it was.
  const reChopPrevious = (prev, chopLine, newIsLower) => {
    prev.savedPromise.then(async (prevId) => {
      if (!prevId) return; // previous never saved (extraction failed)
      const current = getPassage(prevId);
      if (!current) return; // deleted, or merged away into another entry
      // new below prev → prev is the upper one → trim its bottom, and vice versa.
      const newBounds = newIsLower
        ? { ...current.selectionBounds, yMax: Math.min(current.selectionBounds.yMax, chopLine) }
        : { ...current.selectionBounds, yMin: Math.max(current.selectionBounds.yMin, chopLine) };
      try {
        const recropped = await cropImageRegion(prev.cropDataUrl, prev.cropBounds, newBounds);
        const res = await extractPassage(recropped);
        if (res.error) return;
        updatePassage(prevId, {
          rawText: res.rawText,
          refinedText: res.refinedText,
          selectionBounds: newBounds,
        });
      } catch {
        // Leave the previous passage as-is.
      }
    });
  };

  // Async and non-blocking by design: the UI already returned to ready state
  // by the time this runs, and multiple of these can be in flight at once if
  // the user gestures again quickly — each resolves into its own passage.
  const performCapture = async (path) => {
    const rawBounds = rawBoundsOf(path);
    let cropBounds = computeSelectionBounds(path);

    // De-duplicate buffer overlaps against recent captures on the same static
    // view: chop this capture's colliding side, and schedule the previous
    // capture to be re-trimmed on its side so neither double-captures the gap.
    const now = performance.now();
    recentCapturesRef.current = recentCapturesRef.current.filter(
      (c) => now - c.tMs < RECENT_CAPTURE_WINDOW_MS
    );
    for (const prev of recentCapturesRef.current) {
      const chop = bufferOverlapChop(prev.rawBounds, rawBounds);
      if (!chop) continue;
      const newIsLower = rawBounds.min > prev.rawBounds.min;
      cropBounds = newIsLower
        ? { ...cropBounds, yMin: Math.max(cropBounds.yMin, chop.chopLine) }
        : { ...cropBounds, yMax: Math.min(cropBounds.yMax, chop.chopLine) };
      reChopPrevious(prev, chop.chopLine, newIsLower);
    }

    const dataUrl = cropVideoFrame(videoRef.current, cropBounds);
    // Grab the active title now, not whenever extraction resolves, so a
    // title logged mid-flight doesn't retroactively relabel this passage.
    const sourceTitle = getCurrentSourceTitle();

    setCaptureBounds(computeSelectionBounds(path, VISUAL_BUFFER_RATIO));

    // Register this capture as "recent" before extraction so a rapid next
    // gesture can de-dup against it; savedPromise resolves to its id once
    // saved (or null if extraction fails).
    let resolveSaved;
    const savedPromise = new Promise((r) => (resolveSaved = r));
    recentCapturesRef.current = [
      { rawBounds, cropBounds, cropDataUrl: dataUrl, savedPromise, tMs: now },
      ...recentCapturesRef.current,
    ].slice(0, MAX_RECENT_CAPTURES);

    const result = await extractPassage(dataUrl);

    if (result.error) {
      resolveSaved(null);
      pushToast("Couldn't read that — try again");
      return;
    }

    const passage = {
      id: uuidv4(),
      capturedAt: new Date().toISOString(),
      rawText: result.rawText,
      refinedText: result.refinedText,
      context: result.context,
      pageNumber: result.pageNumber ?? null,
      sourceTitle,
      touchPath: path,
      selectionBounds: cropBounds,
      isMerged: false,
      mergedFromIds: [],
      audioNote: null,
      audioTranscript: null,
    };

    savePassage(passage);
    resolveSaved(passage.id);
    setHasPassages(true);
    window.dispatchEvent(new CustomEvent('passage-saved', { detail: { id: passage.id } }));
    pushToast('Captured', () => deletePassage(passage.id));

    // Fire-and-forget: entirely invisible to the user either way, per spec —
    // no toast, no prompt, whether it merges or not.
    maybeMergeWithPrevious(passage);
  };

  // Attaches to whichever passage was most recently saved at the moment
  // recording *stops* (not started) — if a new passage lands mid-recording,
  // the note follows the newer one, per spec.
  const handleRecordToggle = async () => {
    if (isRecording) {
      navigator.vibrate?.(10);
      setIsRecording(false);
      const controller = recorderRef.current;
      recorderRef.current = null;
      controller?.stop();
      const result = await controller?.stopPromise;
      if (!result) return;

      const latest = getPassages()[0];
      if (!latest) return; // nothing to attach to anymore — graceful no-op
      updatePassage(latest.id, { audioNote: result.dataUrl, audioTranscript: null });
      return;
    }

    if (!hasPassages) {
      pushToast('Capture something first');
      return;
    }

    navigator.vibrate?.(10);
    try {
      recorderRef.current = await startRecording();
      setIsRecording(true);
    } catch {
      pushToast('Microphone access denied');
    }
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

      {!cameraError && (
        <VoiceRecordButton
          isRecording={isRecording}
          disabled={!hasPassages}
          onToggle={handleRecordToggle}
        />
      )}

      <UndoToast toasts={toasts} onDismiss={removeToast} />
    </div>
  );
}
