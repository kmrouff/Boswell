import { useEffect, useRef, useState } from 'react';
import CaptureView from './components/CaptureView.jsx';
import LibraryView from './components/LibraryView.jsx';
import ChatView from './components/ChatView.jsx';
import FeedbackOverlay from './components/FeedbackOverlay.jsx';
import LoginView from './components/LoginView.jsx';
import { supabase, isSupabaseConfigured } from './lib/supabaseClient.js';
import { applyThemeVars, resolveTheme, getStoredTheme, getStoredAccent, getStoredRadius } from './lib/theme.js';

const TABS = [
  {
    id: 'capture',
    label: 'Capture',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <rect x="3" y="6.5" width="18" height="13" rx="3" stroke="currentColor" strokeWidth="1.7" />
        <circle cx="12" cy="13" r="3.4" stroke="currentColor" strokeWidth="1.7" />
        <rect x="8.5" y="4" width="7" height="3" rx="1.2" fill="currentColor" />
      </svg>
    ),
  },
  {
    id: 'library',
    label: 'Library',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <rect x="4" y="4" width="16" height="4" rx="1.5" stroke="currentColor" strokeWidth="1.7" />
        <rect x="4" y="10" width="16" height="4" rx="1.5" stroke="currentColor" strokeWidth="1.7" />
        <rect x="4" y="16" width="16" height="4" rx="1.5" stroke="currentColor" strokeWidth="1.7" />
      </svg>
    ),
  },
  {
    id: 'chat',
    label: 'Chat',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <rect x="3.5" y="4.5" width="17" height="12" rx="4" stroke="currentColor" strokeWidth="1.7" />
        <path d="M8 16.5 L8 20 L12 16.5" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" fill="none" />
      </svg>
    ),
  },
];

const LIBRARY_PULSE_MS = 600;

// Feedback trigger: two fingers held together, without much drift, for this
// long — anywhere in the app. Deliberately not a labeled button; a button is
// a different instinct than the fast/instinctive gestures the app already
// uses (drag-to-capture, triple-tap-for-title).
const FEEDBACK_HOLD_MS = 550;
const FEEDBACK_MOVE_CANCEL_PX = 15;

function App() {
  // Applied synchronously during the initial render (not in a useEffect), so
  // the very first paint already reflects the saved theme — avoids a flash
  // of default colors before an effect would otherwise run post-paint.
  useState(() => {
    applyThemeVars(resolveTheme(getStoredTheme(), getStoredAccent(), getStoredRadius()));
    return null;
  });

  const [activeTab, setActiveTab] = useState('capture');
  const [libraryPulsing, setLibraryPulsing] = useState(false);
  // A small persistent badge on the Library tab, on for as long as Capture's
  // record button is in its post-capture "add a voice note?" window.
  const [libraryDot, setLibraryDot] = useState(false);
  // Bumped on every passage-saved (a capture, or a voice note landing on
  // one) — used as the dot's React key so it remounts and its pop animation
  // replays each time, instead of only playing once when the dot first
  // appears.
  const [pulseKey, setPulseKey] = useState(0);
  // A request from the Library to (re)set a passage's title, routed to the
  // Capture view's title mode: { passageId } or null.
  const [titleRequest, setTitleRequest] = useState(null);
  // A citation tap from Chat, routed to the Library view to flash that
  // passage: { id, key } or null — `key` lets repeat taps on the same
  // passage re-trigger the flash even though `id` didn't change.
  const [citeRequest, setCiteRequest] = useState(null);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const feedbackGestureRef = useRef({ timer: null, points: new Map() });
  // undefined = session not checked yet, null = checked and signed out,
  // object = signed in.
  const [session, setSession] = useState(undefined);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });
    return () => subscription.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    // The dot's own small pop replays on every passage-saved (subtle, fine
    // to be chatty). The big nav-icon bounce is reserved for a capture
    // spree actually finishing — see CaptureView's closeAudioWindow — so it
    // reads as "this batch is now saved," not one bounce per capture.
    const onPassageSaved = () => {
      setPulseKey((k) => k + 1);
    };
    const onCaptureSpreeSaved = () => {
      setLibraryPulsing(true);
      setTimeout(() => setLibraryPulsing(false), LIBRARY_PULSE_MS);
      setPulseKey((k) => k + 1);
    };
    const onAudioWindowOpen = () => setLibraryDot(true);
    const onAudioWindowClose = () => setLibraryDot(false);
    window.addEventListener('passage-saved', onPassageSaved);
    window.addEventListener('capture-spree-saved', onCaptureSpreeSaved);
    window.addEventListener('audio-window-open', onAudioWindowOpen);
    window.addEventListener('audio-window-close', onAudioWindowClose);
    return () => {
      window.removeEventListener('passage-saved', onPassageSaved);
      window.removeEventListener('capture-spree-saved', onCaptureSpreeSaved);
      window.removeEventListener('audio-window-open', onAudioWindowOpen);
      window.removeEventListener('audio-window-close', onAudioWindowClose);
    };
  }, []);

  const requestTitleForPassage = (passageId) => {
    setTitleRequest({ passageId });
    setActiveTab('capture');
  };

  const jumpToPassage = (id) => {
    setCiteRequest({ id, key: `${id}-${Math.random()}` });
    setActiveTab('library');
  };

  // Global two-finger-hold detection for the feedback trigger. Tracked via a
  // ref (not state) since touchmove fires often and shouldn't cause
  // re-renders; only crossing into the held-and-triggered state touches
  // React state. Cancels on a third finger, on drift past the threshold, or
  // if the finger count drops below two before the hold completes.
  const clearFeedbackTimer = () => {
    clearTimeout(feedbackGestureRef.current.timer);
    feedbackGestureRef.current.timer = null;
  };

  const handleFeedbackTouchStart = (e) => {
    if (feedbackOpen) return;
    if (e.touches.length !== 2) {
      clearFeedbackTimer();
      return;
    }
    feedbackGestureRef.current.points = new Map(
      [...e.touches].map((t) => [t.identifier, { x: t.clientX, y: t.clientY }])
    );
    clearFeedbackTimer();
    feedbackGestureRef.current.timer = setTimeout(() => {
      feedbackGestureRef.current.timer = null;
      navigator.vibrate?.([10, 30, 10]);
      setFeedbackOpen(true);
    }, FEEDBACK_HOLD_MS);
  };

  const handleFeedbackTouchMove = (e) => {
    if (!feedbackGestureRef.current.timer) return;
    if (e.touches.length !== 2) {
      clearFeedbackTimer();
      return;
    }
    for (const t of e.touches) {
      const start = feedbackGestureRef.current.points.get(t.identifier);
      if (!start) continue;
      if (Math.hypot(t.clientX - start.x, t.clientY - start.y) > FEEDBACK_MOVE_CANCEL_PX) {
        clearFeedbackTimer();
        return;
      }
    }
  };

  const handleFeedbackTouchEnd = (e) => {
    if (e.touches.length < 2) clearFeedbackTimer();
  };

  // Checking session is effectively instant against Supabase's local
  // storage-cached token, but avoid a login-screen flash for that instant.
  if (!isSupabaseConfigured) {
    return (
      <div
        className="flex h-svh w-full flex-col items-center justify-center gap-2 px-8 text-center"
        style={{ background: 'var(--bg)', color: 'rgb(var(--fg))' }}
      >
        <p className="font-serif text-lg">Supabase isn't configured yet</p>
        <p className="font-sans text-sm" style={{ color: 'rgb(var(--fg) / .6)' }}>
          Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to .env, then reload.
        </p>
      </div>
    );
  }
  if (session === undefined) {
    return <div className="h-svh w-full" style={{ background: 'var(--bg)' }} />;
  }
  if (session === null) {
    return <LoginView />;
  }

  return (
    <div
      className="flex h-svh w-full flex-col"
      style={{ background: 'var(--bg)', color: 'rgb(var(--fg))' }}
      onTouchStart={handleFeedbackTouchStart}
      onTouchMove={handleFeedbackTouchMove}
      onTouchEnd={handleFeedbackTouchEnd}
      onTouchCancel={handleFeedbackTouchEnd}
    >
      <main className="min-h-0 flex-1 overflow-y-auto">
        {activeTab === 'capture' && (
          <CaptureView
            titleRequest={titleRequest}
            onTitleRequestHandled={() => setTitleRequest(null)}
          />
        )}
        {activeTab === 'library' && (
          <LibraryView onRequestTitle={requestTitleForPassage} flashRequest={citeRequest} />
        )}
        {activeTab === 'chat' && <ChatView onCiteJump={jumpToPassage} />}
      </main>

      <nav
        className="flex shrink-0 border-t"
        style={{ borderColor: 'rgb(var(--fg) / .1)', background: 'var(--bg)' }}
      >
        {TABS.map(({ id, label, icon }) => {
          const active = activeTab === id;
          const pulsing = id === 'library' && libraryPulsing;
          return (
            <button
              key={id}
              type="button"
              onClick={() => setActiveTab(id)}
              className="relative flex flex-1 flex-col items-center gap-1 border-none bg-transparent py-1.5 font-sans transition-transform duration-200"
              style={{
                color: active || pulsing ? 'rgb(var(--acc))' : 'rgb(var(--fg) / .4)',
                transform: pulsing ? 'scale(1.1)' : 'scale(1)',
              }}
            >
              {icon}
              <span className="text-[11px] font-semibold">{label}</span>
              {id === 'library' && libraryDot && (
                <span
                  key={pulseKey}
                  className="animate-badge-pop absolute h-2.5 w-2.5 rounded-full bg-amber-400"
                  style={{ top: 2, left: 'calc(50% + 7px)', boxShadow: '0 0 0 2px var(--bg)' }}
                />
              )}
            </button>
          );
        })}
      </nav>

      {feedbackOpen && <FeedbackOverlay view={activeTab} onClose={() => setFeedbackOpen(false)} />}
    </div>
  );
}

export default App;
