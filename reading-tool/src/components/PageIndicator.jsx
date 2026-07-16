import { useRef, useState } from 'react';

// Faded page-number readout near the bottom of the capture view. Shows what
// page the app currently thinks it's on. Tapping opens an adjuster: drag the
// number up/down to step it (like a scrollable number field), or tap again to
// type it directly.
const PX_PER_STEP = 12; // vertical drag distance for a ±1 change

export default function PageIndicator({ page, onChange }) {
  const [editing, setEditing] = useState(false);
  const [typing, setTyping] = useState(false);
  const [typeValue, setTypeValue] = useState('');
  const dragRef = useRef(null);

  const numericPage = () => {
    const n = parseInt(page, 10);
    return Number.isFinite(n) ? n : 0;
  };

  const onPointerDown = (e) => {
    if (typing) return;
    dragRef.current = { startY: e.clientY, startPage: numericPage(), moved: false };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };

  const onPointerMove = (e) => {
    if (!dragRef.current) return;
    const dy = dragRef.current.startY - e.clientY; // up = increase
    if (Math.abs(dy) > 3) dragRef.current.moved = true;
    const next = Math.max(0, dragRef.current.startPage + Math.round(dy / PX_PER_STEP));
    onChange(String(next));
  };

  const onPointerUp = () => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (drag && !drag.moved) {
      // A tap (no drag) → open the type field.
      setTypeValue(page ?? '');
      setTyping(true);
    }
  };

  const commitTyping = () => {
    const trimmed = typeValue.trim();
    onChange(trimmed || null);
    setTyping(false);
    setEditing(false);
  };

  // bottom-[38px] centers this h-9 pill on the record button's own center
  // (bottom-7 + half of its h-14), so the two sit on the same horizontal
  // line at opposite sides of the screen rather than each floating at its
  // own arbitrary height.
  if (typing) {
    return (
      <div className="absolute bottom-[38px] left-6 z-20 flex h-9 items-center gap-2 rounded-full bg-black/70 px-3">
        <span className="text-xs text-parchment/60">Page</span>
        <input
          autoFocus
          inputMode="numeric"
          value={typeValue}
          onChange={(e) => setTypeValue(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && commitTyping()}
          onBlur={commitTyping}
          className="w-14 border-b border-parchment/40 bg-transparent text-center text-sm text-parchment focus:outline-none"
        />
      </div>
    );
  }

  return (
    <button
      type="button"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onFocus={() => setEditing(true)}
      onBlur={() => setEditing(false)}
      className={`absolute bottom-[38px] left-6 z-20 flex h-9 touch-none items-center rounded-full px-3 text-xs transition-colors ${
        editing ? 'bg-black/70 text-parchment' : 'bg-black/40 text-parchment/50'
      }`}
    >
      {page ? `Page ${page}` : 'Page —'}
      {editing && <span className="ml-1 text-parchment/40">· drag or tap to set</span>}
    </button>
  );
}
