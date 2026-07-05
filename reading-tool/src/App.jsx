import { useState } from 'react';
import CaptureView from './components/CaptureView.jsx';
import LibraryView from './components/LibraryView.jsx';
import ChatView from './components/ChatView.jsx';

const TABS = [
  { id: 'capture', label: 'Capture', View: CaptureView },
  { id: 'library', label: 'Library', View: LibraryView },
  { id: 'chat', label: 'Chat', View: ChatView },
];

function App() {
  const [activeTab, setActiveTab] = useState('capture');
  const ActiveView = TABS.find((t) => t.id === activeTab).View;

  return (
    <div className="flex h-svh w-full flex-col bg-ink text-parchment">
      <main className="min-h-0 flex-1 overflow-y-auto">
        <ActiveView />
      </main>

      <nav className="flex shrink-0 border-t border-parchment/10 bg-ink">
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            onClick={() => setActiveTab(id)}
            className={`flex-1 py-3 text-sm transition-colors ${
              activeTab === id
                ? 'text-parchment'
                : 'text-parchment/40 hover:text-parchment/60'
            }`}
          >
            {label}
          </button>
        ))}
      </nav>
    </div>
  );
}

export default App;
