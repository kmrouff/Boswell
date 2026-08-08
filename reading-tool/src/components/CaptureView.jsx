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
  isAuthFailure,
  getCurrentSourceTitle,
  setCurrentSourceTitle,
  getCurrentSourceAuthor,
  setCurrentSourceAuthor,
  getCurrentPage,
  setCurrentPage as persistCurrentPage,
} from '../lib/storage.js';
import { maybeMergeWithPrevious } from '../lib/continuation.js';
import { isDictationSupported, startDictation } from '../lib/dictation.js';
import { addPendingCapture, removePendingCapture } from '../lib/pendingCaptures.js';

const HINT_DISMISSED_KEY = 'capture_hint_dismissed';

// Shown once, the first time a capture opens the voice window. The welcome
// screen also lists this gesture, but a line read before ever using the app
// is easy to forget; this appears at the moment it is actually usable.
const VOICE_HINT_SEEN_KEY = 'voice_hint_seen';

// Deliberately longer than AUDIO_WINDOW_MS, and on its own timer rather than
// tied to the window: it is a sentence to read, and the window closing out
// from under it mid-sentence was too quick on first exposure.
const VOICE_HINT_MS = 4250;
const VOICE_HINT_FADE_MS = 300;

// Lightweight heuristic for a dictated title like "Solaris by Stanisław Lem" —
// not a real NLP split, just a common-case convenience for spoken titles.
const splitDictatedTitle = (text) => {
  const match = /^(.+?)\s+by\s+(.+)$/i.exec(text.trim());
  return match ? { title: match[1].trim(), author: match[2].trim() } : { title: text.trim(), author: null };
};

// Three taps in a row (within this window and this close in position) capture
// the title while in title mode; a lone tap opens the type-a-title field.
const TRIPLE_TAP_WINDOW_MS = 400;
const TRIPLE_TAP_POSITION_THRESHOLD = 0.08;

// How long a capture stays "recent" for buffer-overlap de-duplication. The
// chop assumes the camera hasn't moved between the two captures (a static
// reading view), so it only compares against captures made moments ago.
const RECENT_CAPTURE_WINDOW_MS = 20000;
const MAX_RECENT_CAPTURES = 4;

// How long the record button (and the "Captured N" bubble) stays active
// after a capture, inviting a voice note before it's assumed the passage is
// done (no audio). A recording that's actually in progress isn't subject to
// this — it only gates *starting* one.
const AUDIO_WINDOW_MS = 3250;

// Once a voice note actually attaches, the window gets a short fresh tail
// instead of closing immediately — long enough to see the confirmation, short
// because there's nothing left to decide at that point.
const AUDIO_ATTACHED_TAIL_MS = 2000;

// How long the "Captured N" bubble's shrink-to-a-dot exit animation takes —
// the bubble stays mounted (see bubbleClosing) for this long after the
// window closes so it can actually play, rather than just vanishing.
const BUBBLE_COLLAPSE_MS = 350;

// How long the first-use hint stays on screen before fading on its own.
const HINT_DISPLAY_MS = 3500;

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
  // Mirrors isRecording for reads inside performCapture, which is async and
  // can otherwise close over a stale value from before an await resolved.
  const isRecordingRef = useRef(false);
  // Counts down to the window auto-closing (see openAudioWindow) — distinct
  // from bubbleCloseTimerRef below, which is a separate, shorter timer for
  // the exit-animation tail once closing has already started.
  const audioWindowTimerRef = useRef(null);
  const bubbleCloseTimerRef = useRef(null);
  const voiceHintTimerRef = useRef(null);
  // Whether the current audio window represents an ongoing multi-capture
  // spree, and which stackId ties its captures together in the Library.
  const spreeActiveRef = useRef(false);
  const spreeStackIdRef = useRef(null);

  const [cameraError, setCameraError] = useState(null);
  const [dragBounds, setDragBounds] = useState(null);
  const [captureBounds, setCaptureBounds] = useState(null);
  const [titleCapture, setTitleCapture] = useState(null); // { bounds, phase } confirmation flash
  const [titleMode, setTitleMode] = useState(null); // null | { target:'global' } | { target:'passage', passageId }
  const [titleTyping, setTitleTyping] = useState(false);
  const [toasts, setToasts] = useState([]);
  const [isRecording, setIsRecording] = useState(false);
  const [dictationText, setDictationText] = useState('');
  // Open for AUDIO_WINDOW_MS after a capture (indefinitely while actually
  // recording) — gates whether the record button is active and the
  // "Captured N" bubble is showing. See openAudioWindow below.
  const [audioWindowOpen, setAudioWindowOpen] = useState(false);
  // True for BUBBLE_COLLAPSE_MS while the bubble plays its shrink-to-a-dot
  // exit animation — the bubble stays rendered (audioWindowOpen ||
  // bubbleClosing) for that stretch instead of vanishing the instant the
  // window closes.
  const [bubbleClosing, setBubbleClosing] = useState(false);
  // Whether the most recent capture in this spree has a voice note attached
  // yet — shows a light colored outline on the bubble as a hint, and is
  // cleared the moment a fresh (unrelated) capture lands.
  const [audioAttached, setAudioAttached] = useState(false);
  // First-use coach bubble above the record button — see VOICE_HINT_SEEN_KEY.
  const [voiceHintVisible, setVoiceHintVisible] = useState(false);
  const [voiceHintFading, setVoiceHintFading] = useState(false);
  // How many captures have landed in the current spree — shown in the
  // "Captured N" bubble, which is visible for exactly as long as
  // audioWindowOpen is (they're the same window, just two facets of it).
  const [captureCount, setCaptureCount] = useState(0);
  const [currentTitle, setCurrentTitle] = useState(() => getCurrentSourceTitle());
  const [currentAuthor, setCurrentAuthor] = useState(() => getCurrentSourceAuthor());
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

  // Switching away from Capture mid-window (e.g. straight to Library right
  // after a capture) used to just clear the pending auto-close timer and
  // leave it at that — the timer would never fire, so capture-spree-saved
  // never dispatched, and the Library icon never pulsed for that spree even
  // though the passage itself saves fine in the background regardless. Now
  // treats navigating away as ending the spree immediately: same signal a
  // natural timeout would send, just early. Doesn't call closeAudioWindow
  // itself, since that also touches this component's own state, which is
  // pointless (and risky) to set on an already-unmounting component — only
  // the ref flag and the one global event, which is everything that
  // actually matters once this component is gone.
  useEffect(
    () => () => {
      clearTimeout(audioWindowTimerRef.current);
      clearTimeout(bubbleCloseTimerRef.current);
      clearTimeout(voiceHintTimerRef.current);
      if (spreeActiveRef.current) {
        spreeActiveRef.current = false;
        window.dispatchEvent(new CustomEvent('capture-spree-saved'));
      }
    },
    []
  );

  const dismissHint = () => {
    localStorage.setItem(HINT_DISMISSED_KEY, 'true');
    setHintDismissed(true);
  };

  // The hint is explanatory text, not a control — it fades on its own after a
  // few seconds rather than waiting to be dismissed by touch.
  useEffect(() => {
    if (localStorage.getItem(HINT_DISMISSED_KEY) === 'true') return;
    const t = setTimeout(dismissHint, HINT_DISPLAY_MS);
    return () => clearTimeout(t);
  }, []);

  const pushToast = (message, onUndo, opts = {}) => {
    setToasts((prev) => [...prev, { id: uuidv4(), message, onUndo, ...opts }]);
  };

  // Fades the first-use voice hint out, then unmounts it. Safe to call more
  // than once; a second call while already fading is a no-op.
  const dismissVoiceHint = () => {
    if (!voiceHintVisible || voiceHintFading) return;
    setVoiceHintFading(true);
    clearTimeout(voiceHintTimerRef.current);
    voiceHintTimerRef.current = setTimeout(() => {
      setVoiceHintVisible(false);
      setVoiceHintFading(false);
    }, VOICE_HINT_FADE_MS);
  };

  // Opens (or extends) the record button's active window and the "Captured
  // N" bubble — the same window drives both. Called optimistically the
  // instant a drag is recognized as a capture (handleTouchEnd), before
  // extraction even starts, so the confirmation reads as instant rather than
  // waiting out the few-second API round trip — performCapture rolls this
  // back via rollbackOptimisticCapture if the capture ultimately fails. If
  // one arrives while a recording is already under way, it just re-affirms
  // the window is open without starting a new auto-close countdown (that
  // would risk cutting off an active recording).
  const openAudioWindow = (stackId, isNewSpree) => {
    clearTimeout(audioWindowTimerRef.current);
    clearTimeout(bubbleCloseTimerRef.current);
    setAudioWindowOpen(true);
    setBubbleClosing(false);
    setAudioAttached(false); // a fresh capture never already has audio on it
    if (localStorage.getItem(VOICE_HINT_SEEN_KEY) !== 'true') {
      localStorage.setItem(VOICE_HINT_SEEN_KEY, 'true');
      setVoiceHintVisible(true);
      setVoiceHintFading(false);
      clearTimeout(voiceHintTimerRef.current);
      voiceHintTimerRef.current = setTimeout(() => {
        setVoiceHintFading(true);
        voiceHintTimerRef.current = setTimeout(() => {
          setVoiceHintVisible(false);
          setVoiceHintFading(false);
        }, VOICE_HINT_FADE_MS);
      }, VOICE_HINT_MS);
    }
    spreeActiveRef.current = true;
    spreeStackIdRef.current = stackId;
    setCaptureCount((c) => (isNewSpree ? 1 : c + 1));
    if (isRecordingRef.current) return;
    audioWindowTimerRef.current = setTimeout(() => {
      audioWindowTimerRef.current = null;
      closeAudioWindow(true);
    }, AUDIO_WINDOW_MS);
  };

  // `committed` distinguishes "the spree finished naturally (timeout or a
  // recording wrapped up) — pulse the Library icon to say it's saved" from
  // "the user undid their way back to zero captures — nothing to celebrate."
  // Plays the bubble's collapse animation first and only actually hides it
  // (and fires the Library pulse) once that's had time to finish, rather
  // than snapping it away the instant the window closes.
  const closeAudioWindow = (committed) => {
    clearTimeout(audioWindowTimerRef.current);
    spreeActiveRef.current = false;
    setBubbleClosing(true);
    clearTimeout(bubbleCloseTimerRef.current);
    bubbleCloseTimerRef.current = setTimeout(() => {
      bubbleCloseTimerRef.current = null;
      setAudioWindowOpen(false);
      setBubbleClosing(false);
      setAudioAttached(false);
      if (committed) window.dispatchEvent(new CustomEvent('capture-spree-saved'));
    }, BUBBLE_COLLAPSE_MS);
  };

  // Undoes an optimistic openAudioWindow call for a capture that turned out
  // not to actually save — same shape as undoLastCapture's close-vs-decrement
  // decision, just driven by isNewSpree (known at optimistic-open time)
  // instead of a live captureCount read.
  const rollbackOptimisticCapture = (isNewSpree) => {
    if (isNewSpree) {
      closeAudioWindow(false);
    } else {
      setCaptureCount((c) => Math.max(0, c - 1));
    }
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

  // Applies a captured/typed/dictated title (+ optional author) to whatever
  // the current title mode targets — the global "working title" (tags future
  // captures) or a specific existing passage (from the Library "add title"
  // flow) — then exits.
  const applyTitle = async (title, author = null) => {
    if (titleMode?.target === 'passage') {
      await updatePassage(titleMode.passageId, { sourceTitle: title, sourceAuthor: author });
      window.dispatchEvent(new CustomEvent('passage-saved', { detail: { id: titleMode.passageId } }));
    } else {
      setCurrentSourceTitle(title);
      setCurrentSourceAuthor(author);
      setCurrentTitle(title);
      setCurrentAuthor(author);
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
      const current = await getPassage(prevId);
      if (!current) return;
      const newBounds = newIsLower
        ? { ...current.selectionBounds, yMax: Math.min(current.selectionBounds.yMax, chopLine) }
        : { ...current.selectionBounds, yMin: Math.max(current.selectionBounds.yMin, chopLine) };
      try {
        const recropped = await cropImageRegion(prev.cropDataUrl, prev.cropBounds, newBounds);
        const res = await extractPassage(recropped);
        if (res.error) return;
        await updatePassage(prevId, {
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
  // stackId/isNewSpree/passageId are decided by the caller (handleTouchEnd)
  // at drag time, not here at resolution time — see the "Captured N"
  // bubble's optimistic-open comment below for why.
  const performCapture = async (path, stackId, passageId, isNewSpree) => {
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
    const sourceAuthor = getCurrentSourceAuthor();
    const workingPage = getCurrentPage();

    setCaptureBounds(computeSelectionBounds(path, VISUAL_BUFFER_RATIO));

    let resolveSaved;
    const savedPromise = new Promise((r) => (resolveSaved = r));
    recentCapturesRef.current = [
      { id: passageId, rawBounds, cropBounds, cropDataUrl: dataUrl, savedPromise, tMs: now },
      ...recentCapturesRef.current,
    ].slice(0, MAX_RECENT_CAPTURES);

    const result = await extractPassage(dataUrl);

    // refined_text is the one NOT NULL column on the table, so an extraction
    // that came back without it would produce an insert that can only ever
    // fail. Treat it as a read failure here rather than letting it reach the
    // database and surface as a confusing save error.
    if (result.error || !result.refinedText) {
      resolveSaved(null);
      rollbackOptimisticCapture(isNewSpree);
      removePendingCapture(passageId);
      pushToast(
        result.contentFiltered
          ? "This passage couldn't be transcribed — try selecting a bit less of it"
          : "Couldn't read that — try again"
      );
      return;
    }

    // A page number the capture actually saw wins and updates the indicator;
    // otherwise fall back to whatever page we currently think we're on.
    if (result.pageNumber) updatePageState(result.pageNumber);

    const passage = {
      id: passageId,
      capturedAt: new Date().toISOString(),
      rawText: result.rawText,
      refinedText: result.refinedText,
      context: result.context,
      pageNumber: result.pageNumber ?? workingPage ?? null,
      sourceTitle,
      sourceAuthor,
      touchPath: path,
      selectionBounds: cropBounds,
      isMerged: false,
      mergedFromIds: [],
      priority: false,
      audioTranscript: null,
      stackId,
    };

    const saveResult = await savePassage(passage);

    if (!saveResult.ok) {
      resolveSaved(null);
      rollbackOptimisticCapture(isNewSpree);
      removePendingCapture(passageId);
      // A rejected write is nearly always a dead session rather than a
      // transient glitch, and "try again" is actively wrong advice for it —
      // retrying fails identically forever. Say what actually happened.
      pushToast(
        isAuthFailure(saveResult.error)
          ? 'Session expired — open Settings and sign in again'
          : `Couldn't save: ${(saveResult.error?.message || 'unknown error').slice(0, 90)}`
      );
      return;
    }

    resolveSaved(passage.id);
    removePendingCapture(passage.id);
    window.dispatchEvent(new CustomEvent('passage-saved', { detail: { id: passage.id } }));

    maybeMergeWithPrevious(passage);
  };

  // Removes the most-recently-captured passage and decrements the "Captured
  // N" count. Deliberately targets recentCapturesRef.current[0] — the exact
  // in-memory record of the capture this bubble is for — rather than
  // querying getPassages() for "whatever's newest in storage right now",
  // which would be racy against the bubble's own optimistic-open timing (see
  // openAudioWindow).
  // Optimistic, like the rest of this app's gesture-driven UI: the count
  // decrements (or the bubble starts its close/collapse) the instant Undo is
  // tapped, not after the actual delete round-trips to Supabase — that part
  // happens in the background, waiting on the tracked savedPromise first if
  // the original save hasn't landed yet (nothing to delete until it has).
  // Dropping to zero ends the spree outright — nothing left to attach a
  // voice note to, so there's no reason to keep the window open. The
  // close-vs-decrement decision reads captureCount directly rather than
  // inside the setCaptureCount updater — updater functions must stay pure,
  // and closeAudioWindow has side effects (another setState, dispatching
  // window events).
  const undoLastCapture = () => {
    const pending = recentCapturesRef.current[0];
    if (!pending) return;
    recentCapturesRef.current = recentCapturesRef.current.filter((c) => c !== pending);
    navigator.vibrate?.(10);
    // Optimistic here too — clears Library's placeholder card immediately
    // rather than waiting on the background delete below, which harmlessly
    // no-ops (removePendingCapture) if the real save already landed and got
    // cleared by its own success-path call by the time this fires.
    removePendingCapture(pending.id);
    if (captureCount <= 1) {
      // Deferred a tick: calling this synchronously right here — a setState
      // in App, a different component than this click handler belongs to —
      // was tripping React's cross-component update-during-render warning.
      setTimeout(() => closeAudioWindow(false), 0);
    } else {
      setCaptureCount((c) => Math.max(0, c - 1));
    }
    pending.savedPromise.then((id) => {
      if (!id) return; // extraction/save already failed and rolled back itself — nothing to undo
      deletePassage(id).then(() => {
        window.dispatchEvent(new CustomEvent('passage-saved', { detail: { id } }));
      });
    });
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
      isRecordingRef.current = false;
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
        if (transcript) {
          const { title, author } = splitDictatedTitle(transcript);
          applyTitle(title, author);
        } else {
          exitTitleMode();
        }
        return;
      }

      // Whatever passage is newest right now "wins" the note — if another
      // drag happened while this recording was running, it's that one, not
      // whatever was newest when recording started.
      if (!transcript) {
        closeAudioWindow(true);
        return;
      }
      const latest = (await getPassages())[0];
      if (!latest) {
        closeAudioWindow(true); // nothing to attach to anymore
        return;
      }
      await updatePassage(latest.id, { audioTranscript: transcript });
      window.dispatchEvent(new CustomEvent('passage-saved', { detail: { id: latest.id } }));
      // A short fresh tail instead of closing right away, so the
      // attached-audio outline actually gets seen — same auto-close
      // mechanism as openAudioWindow, just shorter, since there's nothing
      // left to decide once it fires.
      setAudioAttached(true);
      clearTimeout(audioWindowTimerRef.current);
      audioWindowTimerRef.current = setTimeout(() => {
        audioWindowTimerRef.current = null;
        closeAudioWindow(true);
      }, AUDIO_ATTACHED_TAIL_MS);
      return;
    }

    if (!titleMode && !audioWindowOpen) {
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
      isRecordingRef.current = true;
      clearTimeout(audioWindowTimerRef.current);
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
    applyTitle(title, result.author || null);
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
    dismissVoiceHint();
    if (!titleMode) setDragBounds({ min: point.y, max: point.y });
    navigator.vibrate?.(10);
    if (!hintDismissed) dismissHint();
  };

  // Tracked as just [start, current] rather than a growing history of every
  // point along the way — so the live selection is always the span between
  // where the finger started and where it is *right now*, not the widest
  // extent it's ever reached. That's what lets dragging back up retrace and
  // shrink the selection instead of it only ever growing: the moment the
  // finger crosses back over already-covered ground, "current" retreats and
  // the far edge follows it in, live. computeSelectionBounds/rawBoundsOf/
  // isMeaningfulDrag all just take min/max over whatever's in this array, so
  // a 2-element array works unchanged — no other consumer needs per-point
  // history (touchPath is otherwise only ever stored, never read back).
  const handleTouchMove = (e) => {
    if (titleMode) return;
    const touch = e.touches[0];
    const rect = containerRef.current.getBoundingClientRect();
    const point = normalizePoint(touch.clientX, touch.clientY, rect);
    const start = touchPathRef.current[0];
    touchPathRef.current = [start, { ...point, t: performance.now() - startTimeRef.current }];
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

    // Optimistic: open the "Captured N" bubble / record-button window right
    // now, the instant the drag is recognized — not after the few-second
    // extraction round trip performCapture is about to run. Decided here
    // (real temporal drag order) rather than at extraction-resolution time,
    // which also sidesteps the old race where two overlapping captures could
    // resolve out of order and fight over which one "started" the spree.
    const isNewSpree = !spreeActiveRef.current;
    const stackId = isNewSpree ? uuidv4() : spreeStackIdRef.current;
    openAudioWindow(stackId, isNewSpree);

    // Generated here rather than inside performCapture so Library can be
    // told about this exact passage before it exists — see
    // addPendingCapture below — and performCapture just uses this same id
    // for the real row once extraction/save actually succeeds.
    const passageId = uuidv4();
    addPendingCapture({ id: passageId, stackId, capturedAt: new Date().toISOString() });

    performCapture(path, stackId, passageId, isNewSpree);
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
          initialAuthor={titleMode?.target === 'passage' ? '' : currentAuthor ?? ''}
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
            <span className="text-parchment/50">＋ Tap to add title</span>
          )}
        </button>
      )}

      {!hintDismissed && !cameraError && !titleMode && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center px-12 text-center">
          <span
            className="font-serif text-base text-parchment/90"
            style={{ textShadow: '0 1px 8px rgba(0,0,0,.8)' }}
          >
            Drag down over text to capture
          </span>
        </div>
      )}

      {/* Live dictation transcript preview. */}
      {isRecording && (
        <div className="absolute bottom-28 left-1/2 z-20 max-w-[80%] -translate-x-1/2 rounded-lg bg-black/70 px-4 py-2 text-center text-sm text-parchment">
          {dictationText || (titleMode ? 'Speak the title…' : 'Listening…')}
        </div>
      )}

      {/* "Captured N" + Undo — the primary immediate confirmation that a
          drag actually landed, replacing a delayed toast. Sits on the same
          row as the Page indicator and record button (bottom-[38px], h-9 —
          matches PageIndicator's own centering against the record button's
          center), just above the tab bar. Visible for as long as the record
          button is active, plus BUBBLE_COLLAPSE_MS more while it plays its
          shrink-to-a-dot exit (bubbleClosing) — only once that's done does
          the Library icon pulse, via closeAudioWindow's own delayed dispatch.
          A light red outline appears once a voice note actually attaches
          (audioAttached), cleared the moment a fresh, unrelated capture
          starts a new spree. */}
      {!cameraError && !titleMode && (audioWindowOpen || bubbleClosing) && captureCount > 0 && (
        <div
          className="absolute bottom-[38px] left-1/2 z-20 flex items-center gap-2"
          style={{
            transform: `translateX(-50%) scale(${bubbleClosing ? 0.15 : 1})`,
            opacity: bubbleClosing ? 0 : 1,
            transition: `transform ${BUBBLE_COLLAPSE_MS}ms ease-in, opacity ${BUBBLE_COLLAPSE_MS}ms ease-in`,
          }}
        >
          <button
            type="button"
            onClick={undoLastCapture}
            aria-label="Undo last capture"
            className="flex h-9 w-9 items-center justify-center rounded-full border-none bg-black/60 text-parchment"
          >
            <span className="text-lg leading-none">↺</span>
          </button>
          <div
            className="flex h-9 items-center rounded-full bg-black/60 px-4 text-sm text-parchment"
            style={audioAttached ? { boxShadow: '0 0 0 1.5px rgb(248 113 113 / .85)' } : undefined}
          >
            Captured {captureCount}
          </div>
        </div>
      )}

      {/* Page indicator (bottom) — hidden in title mode. */}
      {!cameraError && !titleMode && (
        <PageIndicator page={currentPage} onChange={updatePageState} />
      )}

      {/* First-use coach bubble, sat directly above the record button while
          the voice window is open. Right-aligned to the button rather than
          centred, so it reads as pointing at it. Hidden once recording
          starts, when it has served its purpose. */}
      {!cameraError && !titleMode && voiceHintVisible && !isRecording && (
        <div
          className="pointer-events-none absolute right-5 bottom-[96px] z-20 max-w-[196px] rounded-2xl bg-black/75 px-3.5 py-2.5 text-right font-sans text-[12.5px] leading-snug text-parchment"
          style={{
            backdropFilter: 'blur(2px)',
            opacity: voiceHintFading ? 0 : 1,
            transition: `opacity ${VOICE_HINT_FADE_MS}ms ease-out`,
          }}
        >
          You can append your thoughts to that captured text with a recording
        </div>
      )}

      {!cameraError && (
        <VoiceRecordButton
          isRecording={isRecording}
          dictation={!!titleMode}
          disabled={!titleMode && !audioWindowOpen && !isRecording}
          onToggle={handleRecordToggle}
        />
      )}

      <UndoToast toasts={toasts} onDismiss={removeToast} />
    </div>
  );
}
