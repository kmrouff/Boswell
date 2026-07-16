import { useEffect, useState } from 'react';
import CaptureView from './components/CaptureView.jsx';
import LibraryView from './components/LibraryView.jsx';
import ChatView from './components/ChatView.jsx';
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
  // A request from the Library to (re)set a passage's title, routed to the
  // Capture view's title mode: { passageId } or null.
  const [titleRequest, setTitleRequest] = useState(null);
  // A citation tap from Chat, routed to the Library view to flash that
  // passage: { id, key } or null — `key` lets repeat taps on the same
  // passage re-trigger the flash even though `id` didn't change.
  const [citeRequest, setCiteRequest] = useState(null);

  useEffect(() => {
    const onPassageSaved = () => {
      setLibraryPulsing(true);
      setTimeout(() => setLibraryPulsing(false), LIBRARY_PULSE_MS);
    };
    const onAudioWindowOpen = () => setLibraryDot(true);
    const onAudioWindowClose = () => setLibraryDot(false);
    window.addEventListener('passage-saved', onPassageSaved);
    window.addEventListener('audio-window-open', onAudioWindowOpen);
    window.addEventListener('audio-window-close', onAudioWindowClose);
    return () => {
      window.removeEventListener('passage-saved', onPassageSaved);
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

  return (
    <div className="flex h-svh w-full flex-col" style={{ background: 'var(--bg)', color: 'rgb(var(--fg))' }}>
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
                  className="absolute h-2.5 w-2.5 rounded-full bg-amber-400"
                  style={{ top: 2, left: 'calc(50% + 7px)', boxShadow: '0 0 0 2px var(--bg)' }}
                />
              )}
            </button>
          );
        })}
      </nav>
    </div>
  );
}

export default App;
