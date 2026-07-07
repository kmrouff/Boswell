import { useEffect, useState } from 'react';
import { getPassages, deletePassage } from '../lib/storage.js';
import PassageCard from './PassageCard.jsx';

const MISC = 'Miscellaneous';

export default function LibraryView({ onRequestTitle }) {
  const [passages, setPassages] = useState(() => getPassages());
  const [groupByTitle, setGroupByTitle] = useState(false);

  useEffect(() => {
    const refresh = () => setPassages(getPassages());
    window.addEventListener('passage-saved', refresh);
    return () => window.removeEventListener('passage-saved', refresh);
  }, []);

  const refresh = () => setPassages(getPassages());

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

  const cardProps = { onDelete: handleDelete, onRequestTitle, onChanged: refresh };

  // Group by title, preserving newest-first order; untitled → Miscellaneous,
  // which always sorts last.
  const grouped = () => {
    const groups = new Map();
    for (const p of passages) {
      const key = p.sourceTitle || MISC;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(p);
    }
    return [...groups.entries()].sort((a, b) => {
      if (a[0] === MISC) return 1;
      if (b[0] === MISC) return -1;
      return 0;
    });
  };

  return (
    <div className="flex flex-col gap-3 p-4">
      <div className="flex items-center justify-end gap-2 text-xs">
        <span className="text-parchment/40">View</span>
        <div className="flex overflow-hidden rounded-full border border-parchment/20">
          <button
            type="button"
            onClick={() => setGroupByTitle(false)}
            className={`px-3 py-1 ${!groupByTitle ? 'bg-parchment/15 text-parchment' : 'text-parchment/50'}`}
          >
            Recent
          </button>
          <button
            type="button"
            onClick={() => setGroupByTitle(true)}
            className={`px-3 py-1 ${groupByTitle ? 'bg-parchment/15 text-parchment' : 'text-parchment/50'}`}
          >
            By title
          </button>
        </div>
      </div>

      {!groupByTitle &&
        passages.map((passage) => <PassageCard key={passage.id} passage={passage} {...cardProps} />)}

      {groupByTitle &&
        grouped().map(([title, items]) => (
          <div key={title} className="flex flex-col gap-3">
            <h2 className="mt-2 border-b border-parchment/10 pb-1 text-sm font-medium text-parchment/60">
              {title}
            </h2>
            {items.map((passage) => (
              <PassageCard key={passage.id} passage={passage} {...cardProps} />
            ))}
          </div>
        ))}
    </div>
  );
}
