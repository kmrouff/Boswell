import { useEffect, useState } from 'react';
import CaptureView from './components/CaptureView.jsx';
import LibraryView from './components/LibraryView.jsx';
import ChatView from './components/ChatView.jsx';

const TABS = [
  { id: 'capture', label: 'Capture' },
  { id: 'library', label: 'Library' },
  { id: 'chat', label: 'Chat' },
];

const LIBRARY_PULSE_MS = 600;

function App() {
  const [activeTab, setActiveTab] = useState('capture');
  const [libraryPulsing, setLibraryPulsing] = useState(false);
  // A request from the Library to (re)set a passage's title, routed to the
  // Capture view's title mode: { passageId } or null.
  const [titleRequest, setTitleRequest] = useState(null);

  useEffect(() => {
    const onPassageSaved = () => {
      setLibraryPulsing(true);
      setTimeout(() => setLibraryPulsing(false), LIBRARY_PULSE_MS);
    };
    window.addEventListener('passage-saved', onPassageSaved);
    return () => window.removeEventListener('passage-saved', onPassageSaved);
  }, []);

  const requestTitleForPassage = (passageId) => {
    setTitleRequest({ passageId });
    setActiveTab('capture');
  };

  return (
    <div className="flex h-svh w-full flex-col bg-ink text-parchment">
      <main className="min-h-0 flex-1 overflow-y-auto">
        {activeTab === 'capture' && (
          <CaptureView
            titleRequest={titleRequest}
            onTitleRequestHandled={() => setTitleRequest(null)}
          />
        )}
        {activeTab === 'library' && <LibraryView onRequestTitle={requestTitleForPassage} />}
        {activeTab === 'chat' && <ChatView />}
      </main>

      <nav className="flex shrink-0 border-t border-parchment/10 bg-ink">
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            onClick={() => setActiveTab(id)}
            className={`flex-1 py-3 text-sm transition-transform transition-colors duration-200 ${
              activeTab === id ? 'text-parchment' : 'text-parchment/40 hover:text-parchment/60'
            } ${id === 'library' && libraryPulsing ? 'scale-110 text-parchment' : 'scale-100'}`}
          >
            {label}
          </button>
        ))}
      </nav>
    </div>
  );
}

export default App;
