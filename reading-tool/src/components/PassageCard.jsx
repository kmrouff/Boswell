import { useRef, useState } from 'react';
import { updatePassage } from '../lib/storage.js';
import { isDictationSupported, startDictation } from '../lib/dictation.js';

const formatDate = (iso) =>
  new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

// Merging is intentionally invisible here — a merged passage renders
// identically to a normal one, no badge, per spec. The vague `context` guess
// from extraction is deliberately never shown; only confidently-known title
// and page appear, and a "+" lets the user fill in what's missing.
export default function PassageCard({ passage, onDelete, onRequestTitle, onChanged }) {
  const [expanded, setExpanded] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [transcriptOpen, setTranscriptOpen] = useState(false);
  const [editingPage, setEditingPage] = useState(false);
  const [pageValue, setPageValue] = useState(passage.pageNumber ?? '');
  const [recording, setRecording] = useState(false);
  const [dictationText, setDictationText] = useState('');
  const dictationRef = useRef(null);

  const meta = [
    passage.sourceTitle,
    passage.pageNumber ? `p. ${passage.pageNumber}` : null,
  ].filter(Boolean);

  const savePage = () => {
    const trimmed = String(pageValue).trim();
    updatePassage(passage.id, { pageNumber: trimmed || null });
    setEditingPage(false);
    setMenuOpen(false);
    onChanged?.();
  };

  const toggleVoiceNote = async () => {
    if (recording) {
      const controller = dictationRef.current;
      dictationRef.current = null;
      setRecording(false);
      controller?.stop();
      let transcript = '';
      try {
        transcript = (await controller?.finalPromise) || '';
      } catch {
        transcript = '';
      }
      transcript = transcript.trim();
      setDictationText('');
      if (transcript) {
        updatePassage(passage.id, { audioTranscript: transcript, audioNote: null });
        onChanged?.();
      }
      setMenuOpen(false);
      return;
    }
    if (!isDictationSupported()) return;
    try {
      setDictationText('');
      dictationRef.current = startDictation({ onResult: (t) => setDictationText(t) });
      setRecording(true);
    } catch {
      setRecording(false);
    }
  };

  return (
    <div className="rounded-lg border border-parchment/10 bg-parchment/5 p-4">
      <button type="button" onClick={() => setExpanded((e) => !e)} className="w-full text-left">
        <p className={`text-parchment ${expanded ? '' : 'line-clamp-2'}`}>{passage.refinedText}</p>
      </button>

      {/* Breathing room between the excerpt and everything else. */}
      {meta.length > 0 && <p className="mt-4 text-xs text-parchment/50">{meta.join(' · ')}</p>}

      {/* Voice note: a distinct, collapsed annotation — not conflated with the excerpt. */}
      {passage.audioTranscript && (
        <button
          type="button"
          onClick={() => setTranscriptOpen((o) => !o)}
          className={meta.length > 0 ? 'mt-2 w-full text-left' : 'mt-4 w-full text-left'}
        >
          <span className="text-xs uppercase tracking-wide text-amber-300/70">🎙 Voice note</span>
          <p className={`text-sm italic text-parchment/70 ${transcriptOpen ? '' : 'line-clamp-1'}`}>
            {passage.audioTranscript}
          </p>
        </button>
      )}

      {recording && (
        <p className="mt-2 text-sm italic text-amber-300/80">{dictationText || 'Listening…'}</p>
      )}

      {editingPage && (
        <div className="mt-3 flex items-center gap-2">
          <span className="text-xs text-parchment/50">Page</span>
          <input
            autoFocus
            inputMode="numeric"
            value={pageValue}
            onChange={(e) => setPageValue(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && savePage()}
            className="w-16 border-b border-parchment/40 bg-transparent text-sm text-parchment focus:outline-none"
          />
          <button type="button" onClick={savePage} className="text-xs text-amber-300 underline">Save</button>
        </div>
      )}

      {menuOpen && !editingPage && (
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => { setMenuOpen(false); onRequestTitle?.(passage.id); }}
            className="rounded-full border border-parchment/20 px-3 py-1 text-xs text-parchment/80"
          >
            Add title
          </button>
          <button
            type="button"
            onClick={() => { setPageValue(passage.pageNumber ?? ''); setEditingPage(true); }}
            className="rounded-full border border-parchment/20 px-3 py-1 text-xs text-parchment/80"
          >
            Add page
          </button>
          <button
            type="button"
            onClick={toggleVoiceNote}
            className={`rounded-full border px-3 py-1 text-xs ${
              recording ? 'border-amber-300 text-amber-300' : 'border-parchment/20 text-parchment/80'
            }`}
          >
            {recording ? 'Stop' : 'Add voicenote'}
          </button>
        </div>
      )}

      <div className="mt-3 flex items-center justify-between gap-3">
        <span className="shrink-0 text-xs text-parchment/40">{formatDate(passage.capturedAt)}</span>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            aria-label="Add annotation"
            className="flex h-6 w-6 items-center justify-center rounded-full border border-parchment/30 text-parchment/70"
          >
            {menuOpen ? '×' : '+'}
          </button>
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
