import { useEffect, useRef, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import MarginTicks from './MarginTicks.jsx';
import CaptureFlash from './CaptureFlash.jsx';
import TitleLoggedFlash from './TitleLoggedFlash.jsx';
import TitleModeOverlay from './TitleModeOverlay.jsx';
import TitleTypingOverlay from './TitleTypingOverlay.jsx';
import PageIndicator from './PageIndicator.jsx';
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
import { extractPassage, extractTitle, extractPageNumber } from '../lib/claude.js';
import {
  savePassage,
  deletePassage,
  getPassage,
  getPassages,
  updatePassage,
  getCurrentSourceTitle,
  setCurrentSourceTitle,
  getCurrentPage,
  setCurrentPage as persistCurrentPage,
} from '../lib/storage.js';
import { maybeMergeWithPrevious } from '../lib/continuation.js';
import { isDictationSupported, startDictation } from '../lib/dictation.js';

const HINT_DISMISSED_KEY = 'capture_hint_dismissed';

// Three taps in a row (within this window and this close in position) capture
// the title while in title mode; a lone tap opens the type-a-title field.
const TRIPLE_TAP_WINDOW_MS = 400;
const TRIPLE_TAP_POSITION_THRESHOLD = 0.08;

// How long a capture stays "recent" for buffer-overlap de-duplication. The
// chop assumes the camera hasn't moved between the two captures (a static
// reading view), so it only compares against captures made moments ago.
const RECENT_CAPTURE_WINDOW_MS = 20000;
const MAX_RECENT_CAPTURES = 4;

export default function CaptureView({ titleRequest, onTitleRequestHandled }) {
  const videoRef = useRef(null);
  const containerRef = useRef(null);
  const touchPathRef = useRef([]);
  const startTimeRef = useRef(0);
  const tapHistoryRef = useRef([]); // recent taps in title mode, max length 2
  const titleTapTimerRef = useRef(null);
  const dictationRef = useRef(null);
  // Recent captures kept transiently in memory (not storage) for buffer-overlap
  // de-duplication: { rawBounds, cropBounds, cropDataUrl, savedPromise, tMs }.
  const recentCapturesRef = useRef([]);

  const [cameraError, setCameraError] = useState(null);
  const [dragBounds, setDragBounds] = useState(null);
  const [captureBounds, setCaptureBounds] = useState(null);
  const [titleCapture, setTitleCapture] = useState(null); // { bounds, phase } confirmation flash
  const [titleMode, setTitleMode] = useState(null); // null | { target:'global' } | { target:'passage', passageId }
  const [titleTyping, setTitleTyping] = useState(false);
  const [toasts, setToasts] = useState([]);
  const [isRecording, setIsRecording] = useState(false);
  const [dictationText, setDictationText] = useState('');
  const [hasPassages, setHasPassages] = useState(() => getPassages().length > 0);
  const [currentTitle, setCurrentTitle] = useState(() => getCurrentSourceTitle());
  const [currentPage, setCurrentPageState] = useState(() => getCurrentPage());
  const [hintDismissed, setHintDismissed] = useState(
    () => localStorage.getItem(HINT_DISMISSED_KEY) === 'true'
  );

  useEffect(() => {
    let stream;
    let cancelled = false;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
        });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
        // One-shot page detection so the indicator has an initial guess. Only
        // when we don't already have a working page — captures and manual
        // adjustment keep it current after that, so we don't re-scan on every
        // visit.
        if (!getCurrentPage()) {
          setTimeout(async () => {
            if (cancelled || !videoRef.current || videoRef.current.readyState < 2) return;
            const frame = cropVideoFrame(videoRef.current, { yMin: 0, yMax: 1 });
            const { pageNumber } = await extractPageNumber(frame);
            if (!cancelled && pageNumber) {
              persistCurrentPage(pageNumber);
              setCurrentPageState(pageNumber);
            }
          }, 1200);
        }
      } catch (err) {
        setCameraError(err);
      }
    })();
    return () => {
      cancelled = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  // Enter title mode when the Library asks to (re)set a passage's title.
  useEffect(() => {
    if (!titleRequest) return;
    setTitleMode({ target: 'passage', passageId: titleRequest.passageId });
    tapHistoryRef.current = [];
    onTitleRequestHandled?.();
  }, [titleRequest, onTitleRequestHandled]);

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

  const updatePageState = (page) => {
    persistCurrentPage(page);
    setCurrentPageState(page);
  };

  const exitTitleMode = () => {
    if (dictationRef.current) {
      dictationRef.current.stop();
      dictationRef.current = null;
      setIsRecording(false);
      setDictationText('');
    }
    clearTimeout(titleTapTimerRef.current);
    tapHistoryRef.current = [];
    setTitleTyping(false);
    setTitleMode(null);
  };

  // Applies a captured/typed/dictated title to whatever the current title mode
  // targets — the global "working title" (tags future captures) or a specific
  // existing passage (from the Library "add title" flow) — then exits.
  const applyTitle = (title) => {
    if (titleMode?.target === 'passage') {
      updatePassage(titleMode.passageId, { sourceTitle: title });
      window.dispatchEvent(new CustomEvent('passage-saved', { detail: { id: titleMode.passageId } }));
    } else {
      setCurrentSourceTitle(title);
      setCurrentTitle(title);
    }
    clearTimeout(titleTapTimerRef.current);
    tapHistoryRef.current = [];
    setTitleTyping(false);
    setTitleMode(null);
  };

  // Retroactively trims a previous capture's overlapping buffer once a later
  // capture reveals where the two should meet, so the shared region isn't
  // extracted into both passages. Fully guarded: any failure leaves the
  // previous passage exactly as it was.
  const reChopPrevious = (prev, chopLine, newIsLower) => {
    prev.savedPromise.then(async (prevId) => {
      if (!prevId) return;
      const current = getPassage(prevId);
      if (!current) return;
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

  // Async and non-blocking: the UI is already back to ready by the time this
  // runs, and several can be in flight at once if the user gestures again.
  const performCapture = async (path) => {
    const rawBounds = rawBoundsOf(path);
    let cropBounds = computeSelectionBounds(path);

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
    const sourceTitle = getCurrentSourceTitle();
    const workingPage = getCurrentPage();

    setCaptureBounds(computeSelectionBounds(path, VISUAL_BUFFER_RATIO));

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

    // A page number the capture actually saw wins and updates the indicator;
    // otherwise fall back to whatever page we currently think we're on.
    if (result.pageNumber) updatePageState(result.pageNumber);

    const passage = {
      id: uuidv4(),
      capturedAt: new Date().toISOString(),
      rawText: result.rawText,
      refinedText: result.refinedText,
      context: result.context,
      pageNumber: result.pageNumber ?? workingPage ?? null,
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

    maybeMergeWithPrevious(passage);
  };

  // Record button: dictates a title while in title mode (amber), otherwise
  // records a voice note that's transcribed to text and attached to the most
  // recent passage. Audio itself is never stored.
  const handleRecordToggle = async () => {
    if (isRecording) {
      navigator.vibrate?.(10);
      const controller = dictationRef.current;
      dictationRef.current = null;
      setIsRecording(false);
      controller?.stop();
      let transcript = '';
      try {
        transcript = (await controller?.finalPromise) || '';
      } catch {
        transcript = '';
      }
      transcript = transcript.trim();
      setDictationText('');

      if (titleMode) {
        if (transcript) applyTitle(transcript);
        else exitTitleMode();
        return;
      }

      if (!transcript) return;
      const latest = getPassages()[0];
      if (!latest) return; // nothing to attach to anymore
      updatePassage(latest.id, { audioTranscript: transcript, audioNote: null });
      window.dispatchEvent(new CustomEvent('passage-saved', { detail: { id: latest.id } }));
      return;
    }

    if (!titleMode && !hasPassages) {
      pushToast('Capture something first');
      return;
    }
    if (!isDictationSupported()) {
      pushToast('Dictation not supported on this browser');
      return;
    }

    navigator.vibrate?.(10);
    try {
      setDictationText('');
      dictationRef.current = startDictation({ onResult: (t) => setDictationText(t) });
      setIsRecording(true);
    } catch (err) {
      pushToast(err.message || 'Could not start dictation');
    }
  };

  // Triple-tap in title mode: read the title from the bracketed region.
  const handleTitleCapture = async () => {
    navigator.vibrate?.([10, 40, 10, 40, 10]);
    const bounds = getTitleCaptureBounds();
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
    setTitleCapture((prev) => (prev ? { ...prev, phase: 'logged' } : null));
    applyTitle(title);
  };

  const handleTitleModeTap = (point) => {
    const now = performance.now();
    const tap = { time: now, x: point.x, y: point.y };
    const recent = tapHistoryRef.current.filter((t) => now - t.time < TRIPLE_TAP_WINDOW_MS);
    const closeToAll = recent.every(
      (t) =>
        Math.abs(t.x - tap.x) < TRIPLE_TAP_POSITION_THRESHOLD &&
        Math.abs(t.y - tap.y) < TRIPLE_TAP_POSITION_THRESHOLD
    );

    clearTimeout(titleTapTimerRef.current);
    if (recent.length === 2 && closeToAll) {
      tapHistoryRef.current = [];
      handleTitleCapture();
      return;
    }
    tapHistoryRef.current = closeToAll ? [...recent, tap] : [tap];
    // A lone tap that doesn't become a triple-tap opens the type-a-title field.
    titleTapTimerRef.current = setTimeout(() => {
      tapHistoryRef.current = [];
      setTitleTyping(true);
    }, TRIPLE_TAP_WINDOW_MS);
  };

  const handleTouchStart = (e) => {
    const touch = e.touches[0];
    const rect = containerRef.current.getBoundingClientRect();
    const point = normalizePoint(touch.clientX, touch.clientY, rect);
    startTimeRef.current = performance.now();
    touchPathRef.current = [{ ...point, t: 0 }];
    if (!titleMode) setDragBounds({ min: point.y, max: point.y });
    navigator.vibrate?.(10);
    if (!hintDismissed) dismissHint();
  };

  const handleTouchMove = (e) => {
    if (titleMode) return;
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
    if (path.length === 0) return;

    if (titleMode) {
      // Only taps matter in title mode; ignore drags.
      if (!isMeaningfulDrag(path)) handleTitleModeTap(path[0]);
      return;
    }

    // Normal mode: only a real drag captures a passage; stray taps do nothing.
    if (!isMeaningfulDrag(path)) return;
    if (!videoRef.current || videoRef.current.readyState < 2) return;
    performCapture(path);
  };

  const cw = containerRef.current?.clientWidth ?? 0;
  const ch = containerRef.current?.clientHeight ?? 0;

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
          <MarginTicks yMin={dragBounds.min} yMax={dragBounds.max} containerHeight={ch} />
        )}

        {containerRef.current && captureBounds && (
          <>
            <MarginTicks yMin={captureBounds.yMin} yMax={captureBounds.yMax} containerHeight={ch} fading />
            <CaptureFlash
              yMin={captureBounds.yMin}
              yMax={captureBounds.yMax}
              containerHeight={ch}
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
            containerWidth={cw}
            containerHeight={ch}
            phase={titleCapture.phase}
            onDone={() => setTitleCapture(null)}
          />
        )}
      </div>

      {containerRef.current && titleMode && !titleTyping && (
        <TitleModeOverlay containerWidth={cw} containerHeight={ch} onCancel={exitTitleMode} />
      )}

      {titleTyping && (
        <TitleTypingOverlay
          initialValue={titleMode?.target === 'passage' ? '' : currentTitle ?? ''}
          onSubmit={applyTitle}
          onCancel={() => setTitleTyping(false)}
        />
      )}

      {cameraError && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-ink p-6 text-center text-parchment">
          <p className="font-medium">Camera access is needed to capture passages.</p>
          <p className="text-sm text-parchment/60">
            Please allow camera access in your browser's site settings, then reload this page.
          </p>
        </div>
      )}

      {/* Title indicator (top) — current working title, or a prompt to set one. */}
      {!cameraError && !titleMode && (
        <button
          type="button"
          onClick={() => setTitleMode({ target: 'global' })}
          className="absolute top-4 left-1/2 z-20 max-w-[80%] -translate-x-1/2 truncate rounded-full bg-black/50 px-4 py-1.5 text-sm text-parchment"
        >
          {currentTitle ? (
            <span className="text-parchment">{currentTitle}</span>
          ) : (
            <span className="text-parchment/50">No title ascribed</span>
          )}
        </button>
      )}

      {!hintDismissed && !cameraError && !titleMode && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 rounded-full bg-black/50 px-4 py-2 text-xs text-parchment/70">
          Drag down over text to capture
        </div>
      )}

      {/* Live dictation transcript preview. */}
      {isRecording && (
        <div className="absolute bottom-28 left-1/2 z-20 max-w-[80%] -translate-x-1/2 rounded-lg bg-black/70 px-4 py-2 text-center text-sm text-parchment">
          {dictationText || (titleMode ? 'Speak the title…' : 'Listening…')}
        </div>
      )}

      {/* Page indicator (bottom) — hidden in title mode. */}
      {!cameraError && !titleMode && (
        <PageIndicator page={currentPage} onChange={updatePageState} />
      )}

      {!cameraError && (
        <VoiceRecordButton
          isRecording={isRecording}
          dictation={!!titleMode}
          disabled={!titleMode && !hasPassages}
          onToggle={handleRecordToggle}
        />
      )}

      <UndoToast toasts={toasts} onDismiss={removeToast} />
    </div>
  );
}
