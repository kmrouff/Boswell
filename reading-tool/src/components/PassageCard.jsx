import { useEffect, useRef, useState } from 'react';
import { updatePassage } from '../lib/storage.js';
import { isDictationSupported, startDictation } from '../lib/dictation.js';

const OPEN_W = 148; // swipe-tray width in px

const HEART_PATH =
  'M12 20 C12 20 3.5 14.5 3.5 8.8 A4.3 4.3 0 0 1 12 6.2 A4.3 4.3 0 0 1 20.5 8.8 C20.5 14.5 12 20 12 20 Z';

const formatDate = (iso) =>
  new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

export function HeartIcon({ size = 18, filled }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round">
      <path d={HEART_PATH} />
    </svg>
  );
}

function TrashIcon({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <line x1="4" y1="7" x2="20" y2="7" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <rect x="9" y="3.5" width="6" height="3" rx="1" stroke="currentColor" strokeWidth="1.7" />
      <rect x="6.5" y="7" width="11" height="13" rx="2" stroke="currentColor" strokeWidth="1.7" />
      <line x1="10" y1="10.5" x2="10" y2="16.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="14" y1="10.5" x2="14" y2="16.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

// Merging is intentionally invisible here — a merged passage renders
// identically to a normal one, no badge, per spec. The vague `context` guess
// from extraction is deliberately never shown; only confidently-known title/
// author/page appear, and a "+" lets the user fill in what's missing.
//
// `grouped` controls the meta line: under a by-title group header, title/
// author are redundant (already shown there), so only the page shows.
// `isOpen`/`onSwipeChange` are lifted to the list so only one card's swipe
// tray is ever open at a time, and the list can force-close it on scroll/
// view/tab changes.
export default function PassageCard({ passage, grouped, isOpen, onSwipeChange, onDelete, onRequestTitle, onChanged, flash }) {
  const [expanded, setExpanded] = useState(false);
  const [ringOn, setRingOn] = useState(false);
  const [ringTransition, setRingTransition] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [transcriptOpen, setTranscriptOpen] = useState(false);
  const [editingPage, setEditingPage] = useState(false);
  const [pageValue, setPageValue] = useState(passage.pageNumber ?? '');
  const [recording, setRecording] = useState(false);
  const [dictationText, setDictationText] = useState('');
  const [dragX, setDragX] = useState(null); // non-null only while actively dragging
  const dictationRef = useRef(null);
  const dragStateRef = useRef(null); // { x, y, axis }
  const dragMovedRef = useRef(false); // suppresses the expand-tap right after a swipe

  const metaText = grouped
    ? passage.pageNumber ? `p. ${passage.pageNumber}` : ''
    : [passage.sourceTitle, passage.sourceAuthor, passage.pageNumber ? `p. ${passage.pageNumber}` : null]
        .filter(Boolean)
        .join('  ·  ');

  // Citation-jump highlight: snap the ring on instantly (no transition), then
  // a tick later enable the transition and turn it off, so it reads as a
  // quick flash-in + slow fade-out rather than a smooth fade-in.
  useEffect(() => {
    if (!flash) return undefined;
    setRingTransition(false);
    setRingOn(true);
    const t = setTimeout(() => {
      setRingTransition(true);
      setRingOn(false);
    }, 10);
    return () => clearTimeout(t);
  }, [flash]);

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

  const togglePriority = () => {
    updatePassage(passage.id, { priority: !passage.priority });
    onSwipeChange?.(null);
    onChanged?.();
  };

  const handleDelete = () => {
    onSwipeChange?.(null);
    onDelete(passage.id);
  };

  // Pointer-based horizontal swipe: engage only once |dx|>|dy| past a 6px
  // threshold (so vertical list scroll still works), lock to that axis for
  // the gesture, and suppress the card's expand-tap if a drag occurred.
  //
  // Pointer capture is grabbed immediately on pointerdown (not deferred to
  // axis-lock time) — a fast real-finger swipe can otherwise carry the touch
  // point outside the card's bounds before the 6px threshold is even
  // crossed, and without capture already in place the browser can fail to
  // deliver the follow-up move/up events to this element at all, leaving
  // the card stuck mid-drag. Capturing early doesn't block native vertical
  // scroll — that's governed by touch-action, not pointer capture.
  const handlePointerDown = (e) => {
    dragStateRef.current = { x: e.clientX, y: e.clientY, axis: null };
    try {
      e.currentTarget.setPointerCapture?.(e.pointerId);
    } catch {
      // Throws on synthetic/edge pointer sequences — safe to ignore.
    }
  };
  const handlePointerMove = (e) => {
    const st = dragStateRef.current;
    if (!st) return;
    const dx = e.clientX - st.x;
    const dy = e.clientY - st.y;
    if (!st.axis) {
      if (Math.abs(dx) > 6 || Math.abs(dy) > 6) {
        st.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
      } else {
        return;
      }
    }
    if (st.axis !== 'x') return;
    dragMovedRef.current = true;
    const base = isOpen ? -OPEN_W : 0;
    setDragX(Math.min(0, Math.max(-OPEN_W - 24, base + dx)));
  };
  const handlePointerUp = () => {
    const st = dragStateRef.current;
    dragStateRef.current = null;
    if (!st) return;
    if (st.axis !== 'x') {
      dragMovedRef.current = false;
      return;
    }
    const finalDragX = dragX ?? (isOpen ? -OPEN_W : 0);
    const open = finalDragX < -OPEN_W / 2;
    setDragX(null);
    onSwipeChange?.(open ? passage.id : null);
    setTimeout(() => {
      dragMovedRef.current = false;
    }, 80);
  };

  const dragging = dragX !== null;
  const tx = dragging ? dragX : isOpen ? -OPEN_W : 0;
  const heartTrayColor = passage.priority ? '#C98A2B' : '#E3B75E';

  return (
    <div className="relative overflow-hidden" style={{ borderRadius: 'var(--radius)' }}>
      {/* action tray, revealed as the card slides left */}
      <div className="absolute inset-y-0 right-0 flex items-stretch">
        {/* Flush against the tray's own left edge and extending well past the
            max overdrag (OPEN_W + 24), so the heart color always fills the
            frame with no seam, however far the card is dragged. */}
        <div className="absolute inset-y-0" style={{ right: '100%', width: 400, background: heartTrayColor }} />
        <button
          type="button"
          onClick={togglePriority}
          aria-label="Prioritize"
          className="flex w-[74px] items-center justify-center border-none"
          style={{ background: heartTrayColor, color: '#3a2e12' }}
        >
          <HeartIcon filled={!!passage.priority} />
        </button>
        <button
          type="button"
          onClick={handleDelete}
          aria-label="Delete passage"
          className="flex w-[74px] items-center justify-center border-none"
          style={{ background: '#7a2d26', color: '#f0d9d4' }}
        >
          <TrashIcon />
        </button>
      </div>

      {/* sliding card */}
      <div
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onLostPointerCapture={handlePointerUp}
        className="relative border p-[18px]"
        style={{
          borderColor: 'rgb(var(--fg) / .1)',
          background: 'var(--surface)',
          borderRadius: 'var(--radius)',
          touchAction: 'pan-y',
          transform: `translateX(${tx}px)`,
          transition: `${dragging ? 'transform 0s' : 'transform .24s cubic-bezier(.22,.61,.36,1)'}, box-shadow ${
            ringTransition ? '1.4s ease-out' : '0s'
          }`,
          boxShadow: ringOn ? 'inset 0 0 0 3px rgb(var(--acc))' : 'inset 0 0 0 0 rgb(var(--acc) / 0)',
        }}
      >
        {passage.priority && (
          <span className="absolute top-3.5 right-4" style={{ color: 'rgb(var(--acc))' }}>
            <HeartIcon size={15} filled />
          </span>
        )}

        <button
          type="button"
          onClick={() => {
            if (dragMovedRef.current) return;
            setExpanded((e) => !e);
          }}
          className="w-full cursor-pointer border-none bg-transparent p-0 text-left"
        >
          <p
            className={`m-0 font-serif text-[19px] leading-[1.45] ${expanded ? '' : 'line-clamp-2'}`}
            style={{ color: 'rgb(var(--fg))', textWrap: 'pretty' }}
          >
            {passage.refinedText}
          </p>
        </button>

        {metaText && (
          <p className="mt-3.5 font-sans text-[12px]" style={{ color: 'rgb(var(--fg) / .5)' }}>
            {metaText}
          </p>
        )}

        {passage.audioTranscript && (
          <button
            type="button"
            onClick={() => setTranscriptOpen((o) => !o)}
            className="mt-3 w-full border-t pt-3 text-left"
            style={{ borderColor: 'rgb(var(--fg) / .08)' }}
          >
            <span
              className="font-sans text-[10.5px] font-semibold tracking-wide uppercase"
              style={{ color: 'rgb(var(--acc) / .8)' }}
            >
              Voice note
            </span>
            <p
              className={`mt-1 font-serif text-[14px] italic ${transcriptOpen ? '' : 'line-clamp-1'}`}
              style={{ color: 'rgb(var(--fg) / .7)' }}
            >
              {passage.audioTranscript}
            </p>
          </button>
        )}

        {recording && (
          <p className="mt-2 font-serif text-sm italic" style={{ color: 'rgb(var(--acc) / .9)' }}>
            {dictationText || 'Listening…'}
          </p>
        )}

        {editingPage && (
          <div className="mt-3 flex items-center gap-2">
            <span className="font-sans text-xs" style={{ color: 'rgb(var(--fg) / .5)' }}>Page</span>
            <input
              autoFocus
              inputMode="numeric"
              value={pageValue}
              onChange={(e) => setPageValue(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && savePage()}
              className="w-16 border-b bg-transparent font-sans text-sm focus:outline-none"
              style={{ borderColor: 'rgb(var(--fg) / .4)', color: 'rgb(var(--fg))' }}
            />
            <button
              type="button"
              onClick={savePage}
              className="font-sans text-xs underline"
              style={{ color: 'rgb(var(--acc))' }}
            >
              Save
            </button>
          </div>
        )}

        {menuOpen && !editingPage && (
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                onRequestTitle?.(passage.id);
              }}
              className="rounded-full border px-3.5 py-2 font-sans text-[12.5px]"
              style={{ borderColor: 'rgb(var(--fg) / .2)', color: 'rgb(var(--fg) / .8)' }}
            >
              Add title
            </button>
            <button
              type="button"
              onClick={() => {
                setPageValue(passage.pageNumber ?? '');
                setEditingPage(true);
              }}
              className="rounded-full border px-3.5 py-2 font-sans text-[12.5px]"
              style={{ borderColor: 'rgb(var(--fg) / .2)', color: 'rgb(var(--fg) / .8)' }}
            >
              Add page
            </button>
            <button
              type="button"
              onClick={toggleVoiceNote}
              className="rounded-full border px-3.5 py-2 font-sans text-[12.5px]"
              style={
                recording
                  ? { borderColor: 'rgb(var(--acc))', color: 'rgb(var(--acc))' }
                  : { borderColor: 'rgb(var(--fg) / .2)', color: 'rgb(var(--fg) / .8)' }
              }
            >
              {recording ? 'Stop' : 'Add voice note'}
            </button>
          </div>
        )}

        <div className="mt-4 flex items-center justify-between">
          <span className="font-sans text-[11.5px]" style={{ color: 'rgb(var(--fg) / .4)' }}>
            {formatDate(passage.capturedAt)}
          </span>
          <button
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            aria-label="Add annotation"
            className="flex h-11 w-11 items-center justify-center border-none bg-transparent font-sans text-[22px] font-bold leading-none transition-transform duration-150 active:scale-[0.8]"
            style={{ color: menuOpen ? 'rgb(var(--acc))' : 'rgb(var(--fg) / .8)' }}
          >
            ＋
          </button>
        </div>
      </div>
    </div>
  );
}
