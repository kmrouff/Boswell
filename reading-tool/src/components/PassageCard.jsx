import { useState } from 'react';

const formatDate = (iso) =>
  new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

// Merging is intentionally invisible here — a merged passage renders
// identically to a normal one, no badge, per spec.
export default function PassageCard({ passage, onDelete }) {
  const [expanded, setExpanded] = useState(false);

  const metaParts = [
    passage.sourceTitle,
    passage.pageNumber ? `p. ${passage.pageNumber}` : null,
    !passage.sourceTitle ? passage.context : null,
  ].filter(Boolean);

  return (
    <div className="rounded-lg border border-parchment/10 bg-parchment/5 p-4">
      <button type="button" onClick={() => setExpanded((e) => !e)} className="w-full text-left">
        <p className={`text-parchment ${expanded ? '' : 'line-clamp-3'}`}>{passage.refinedText}</p>
      </button>

      {metaParts.length > 0 && (
        <p className="mt-2 text-xs text-parchment/50">{metaParts.join(' · ')}</p>
      )}

      <div className="mt-3 flex items-center justify-between gap-3">
        <span className="shrink-0 text-xs text-parchment/40">{formatDate(passage.capturedAt)}</span>
        <div className="flex min-w-0 items-center gap-3">
          {/* Voice note renders inline as an annotation on the passage, not a separate item. */}
          {passage.audioNote && (
            <audio controls src={passage.audioNote} className="h-8 max-w-[140px]" />
          )}
          <button
            type="button"
            onClick={() => onDelete(passage.id)}
            className="shrink-0 text-xs text-parchment/50 underline hover:text-parchment/80"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}
