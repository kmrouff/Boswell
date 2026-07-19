import { useEffect, useRef, useState } from 'react';
import { updatePassage } from '../lib/storage.js';
import { isDictationSupported, startDictation } from '../lib/dictation.js';

const OPEN_W = 148; // swipe-tray width in px — two actions
const OPEN_W_UNSTACK = 222; // three actions, when unstacking is offered

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

// Two squares pulling apart — reads as "separate this from the group",
// distinct from the trash/heart icons already in the tray.
function UnstackIcon({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <rect x="3" y="8" width="9" height="9" rx="1.7" stroke="currentColor" strokeWidth="1.7" />
      <rect x="12" y="7" width="9" height="9" rx="1.7" stroke="currentColor" strokeWidth="1.7" />
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
export default function PassageCard({
  passage,
  grouped,
  isOpen,
  onSwipeChange,
  onDelete,
  onRequestTitle,
  onChanged,
  flash,
  onUnlinkFromStack,
  onRequestStack,
}) {
  const openW = onUnlinkFromStack ? OPEN_W_UNSTACK : OPEN_W;
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

  // Native touch events, matching the pattern CaptureView already uses
  // successfully on real phones — switched over from Pointer Events, whose
  // reliability on iOS Safari (especially combined with touch-action and
  // setPointerCapture) turned out to be the real culprit behind the swipe
  // still being unreliable after two rounds of tuning the pointer-based
  // version. Touch events don't need any capture call at all: per spec,
  // touchmove/touchend for a given touch are always delivered to whatever
  // element touchstart fired on, regardless of where the finger travels —
  // exactly the "lost event" problem setPointerCapture was trying to work
  // around, solved at the platform level instead.
  //
  // Axis is decided once enough combined movement has happened (not off the
  // first couple of noisy pixels — a real thumb's initial contact is rarely
  // dead level, so deciding too early was misreading horizontal swipes as
  // vertical and locking them out for the whole gesture), then locked for
  // its duration so vertical list scroll and horizontal reveal don't fight.
  const handleTouchStart = (e) => {
    const t = e.touches[0];
    dragStateRef.current = { x: t.clientX, y: t.clientY, axis: null };
  };
  const handleTouchMove = (e) => {
    const st = dragStateRef.current;
    if (!st) return;
    const t = e.touches[0];
    const dx = t.clientX - st.x;
    const dy = t.clientY - st.y;
    if (!st.axis) {
      if (Math.hypot(dx, dy) < 10) return;
      st.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
    }
    if (st.axis !== 'x') return;
    dragMovedRef.current = true;
    const base = isOpen ? -openW : 0;
    setDragX(Math.min(0, Math.max(-openW - 24, base + dx)));
  };
  const handleTouchEnd = () => {
    const st = dragStateRef.current;
    dragStateRef.current = null;
    if (!st) return;
    if (st.axis !== 'x') {
      dragMovedRef.current = false;
      return;
    }
    const finalDragX = dragX ?? (isOpen ? -openW : 0);
    const open = finalDragX < -openW / 2;
    setDragX(null);
    onSwipeChange?.(open ? passage.id : null);
    setTimeout(() => {
      dragMovedRef.current = false;
    }, 80);
  };

  const dragging = dragX !== null;
  const tx = dragging ? dragX : isOpen ? -openW : 0;
  const heartTrayColor = passage.priority ? '#C98A2B' : '#E3B75E';

  return (
    <div className="relative overflow-hidden" style={{ borderRadius: 'var(--radius)' }}>
      {/* action tray, revealed as the card slides left. Unstack (when
          offered) sits closest to the card — the least destructive of the
          three, revealed first — with favorite/delete further out. */}
      <div className="absolute inset-y-0 right-0 flex items-stretch">
        {/* Flush against the tray's own left edge and extending well past the
            max overdrag (openW + 24), so the leftmost action's color always
            fills the frame with no seam, however far the card is dragged. */}
        <div
          className="absolute inset-y-0"
          style={{ right: '100%', width: 400, background: onUnlinkFromStack ? '#6b6458' : heartTrayColor }}
        />
        {onUnlinkFromStack && (
          <button
            type="button"
            onClick={() => {
              onSwipeChange?.(null);
              onUnlinkFromStack(passage.id);
            }}
            aria-label="Remove from stack"
            className="flex w-[74px] items-center justify-center border-none"
            style={{ background: '#6b6458', color: '#f2ede2' }}
          >
            <UnstackIcon />
          </button>
        )}
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
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
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
            style={{ color: 'rgb(var(--fg))', maxHeight: expanded ? 'none' : '55px' }}
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
              style={{ color: 'rgb(var(--fg) / .7)', maxHeight: transcriptOpen ? 'none' : '21px' }}
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
            {onRequestStack && passage.sourceTitle && (
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  onRequestStack(passage.id);
                }}
                className="rounded-full border px-3.5 py-2 font-sans text-[12.5px]"
                style={{ borderColor: 'rgb(var(--fg) / .2)', color: 'rgb(var(--fg) / .8)' }}
              >
                Stack with…
              </button>
            )}
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
