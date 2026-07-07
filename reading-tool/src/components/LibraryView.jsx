import { useEffect, useState } from 'react';
import { getPassages, deletePassage } from '../lib/storage.js';
import PassageCard from './PassageCard.jsx';

export default function LibraryView() {
  const [passages, setPassages] = useState(() => getPassages());

  useEffect(() => {
    // Covers the edge case of an extraction resolving while this view is
    // already mounted (e.g. the user switched tabs right after a capture).
    const refresh = () => setPassages(getPassages());
    window.addEventListener('passage-saved', refresh);
    return () => window.removeEventListener('passage-saved', refresh);
  }, []);

  const handleDelete = (id) => {
    deletePassage(id);
    setPassages((prev) => prev.filter((p) => p.id !== id));
  };

  if (passages.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center">
        <p className="text-lg text-parchment/70">No passages yet</p>
        <p className="text-sm text-parchment/40">
          Drag down over text in Capture to save your first one.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 p-4">
      {passages.map((passage) => (
        <PassageCard key={passage.id} passage={passage} onDelete={handleDelete} />
      ))}
    </div>
  );
}
