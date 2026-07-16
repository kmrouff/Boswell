import { useEffect, useRef, useState } from 'react';
import { getPassages, deletePassage, insertPassageAt } from '../lib/storage.js';
import PassageCard, { HeartIcon } from './PassageCard.jsx';
import SettingsDrawer from './SettingsDrawer.jsx';

const MISC = 'Miscellaneous';
const UNDO_WINDOW_MS = 5000;

function DotsIcon() {
  return (
    <svg width="4" height="18" viewBox="0 0 4 18">
      <circle cx="2" cy="2" r="2" fill="currentColor" />
      <circle cx="2" cy="9" r="2" fill="currentColor" />
      <circle cx="2" cy="16" r="2" fill="currentColor" />
    </svg>
  );
}

export default function LibraryView({ onRequestTitle, flashRequest }) {
  const [passages, setPassages] = useState(() => getPassages());
  const [query, setQuery] = useState('');
  const [favOnly, setFavOnly] = useState(false);
  const [grouped, setGrouped] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState({});
  const [swipedId, setSwipedId] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [deleted, setDeleted] = useState(null); // { passage, index }
  const [flashId, setFlashId] = useState(null);
  const deleteTimerRef = useRef(null);
  const flashTimerRef = useRef(null);

  useEffect(() => {
    const refresh = () => setPassages(getPassages());
    window.addEventListener('passage-saved', refresh);
    return () => window.removeEventListener('passage-saved', refresh);
  }, []);

  // Citation jump from Chat: highlight the passage, and if it's hidden
  // inside a collapsed by-title group, expand that group so it's visible.
  useEffect(() => {
    if (!flashRequest) return;
    const target = getPassages().find((p) => p.id === flashRequest.id);
    if (!target) return;
    if (grouped) {
      const key = target.sourceTitle || MISC;
      setExpandedGroups((g) => (g[key] ? g : { ...g, [key]: true }));
    }
    setFlashId(flashRequest.id);
    clearTimeout(flashTimerRef.current);
    flashTimerRef.current = setTimeout(() => setFlashId(null), 1700);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flashRequest]);

  useEffect(() => () => clearTimeout(deleteTimerRef.current), []);

  const refresh = () => setPassages(getPassages());

  const handleDelete = (id) => {
    const index = passages.findIndex((p) => p.id === id);
    if (index < 0) return;
    const passage = passages[index];
    deletePassage(id);
    setPassages((prev) => prev.filter((p) => p.id !== id));
    setDeleted({ passage, index });
    clearTimeout(deleteTimerRef.current);
    deleteTimerRef.current = setTimeout(() => setDeleted(null), UNDO_WINDOW_MS);
  };

  const undoDelete = () => {
    clearTimeout(deleteTimerRef.current);
    if (!deleted) return;
    insertPassageAt(deleted.index, deleted.passage);
    setDeleted(null);
    refresh();
  };

  const toggleGroup = (title) => setExpandedGroups((g) => ({ ...g, [title]: !g[title] }));

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

  const q = query.trim().toLowerCase();
  const matches = (p) => {
    const textMatch =
      !q ||
      p.refinedText.toLowerCase().includes(q) ||
      (p.sourceTitle || '').toLowerCase().includes(q) ||
      (p.sourceAuthor || '').toLowerCase().includes(q) ||
      (p.audioTranscript || '').toLowerCase().includes(q);
    return textMatch && (!favOnly || p.priority);
  };
  const filtered = passages.filter(matches);
  const titleCount = new Set(passages.filter((p) => p.sourceTitle).map((p) => p.sourceTitle)).size;

  const cardProps = {
    isOpen: false, // overridden per-card below
    onSwipeChange: setSwipedId,
    onDelete: handleDelete,
    onRequestTitle,
    onChanged: refresh,
  };

  let groupedEntries = null;
  if (grouped) {
    const groups = new Map();
    for (const p of filtered) {
      const key = p.sourceTitle || MISC;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(p);
    }
    groupedEntries = [...groups.entries()].sort((a, b) => {
      if (a[0] === MISC) return 1;
      if (b[0] === MISC) return -1;
      return 0;
    });
  }

  return (
    <div className="relative flex h-full flex-col">
      <div className="shrink-0 px-[18px] pt-[58px] pb-3">
        <div className="flex items-start justify-between">
          <div>
            <div className="font-display text-[34px] leading-none" style={{ color: 'rgb(var(--fg))' }}>
              Library
            </div>
            <div className="mt-1 font-serif text-sm italic" style={{ color: 'rgb(var(--fg) / .5)' }}>
              {passages.length} {passages.length === 1 ? 'passage' : 'passages'}
              {titleCount > 0 ? ` · ${titleCount} ${titleCount === 1 ? 'title' : 'titles'}` : ''}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            aria-label="Settings"
            className="-mr-2 -mt-1 flex h-[42px] w-[42px] items-center justify-center border-none bg-transparent transition-transform duration-150 active:scale-[0.85]"
            style={{ color: 'rgb(var(--fg) / .6)' }}
          >
            <DotsIcon />
          </button>
        </div>

        <div
          className="mt-3.5 flex h-[46px] items-center gap-2.5 rounded-[14px] border px-3.5"
          style={{ background: 'rgb(var(--fg) / .06)', borderColor: 'rgb(var(--fg) / .14)' }}
        >
          <span style={{ color: 'rgb(var(--fg) / .4)' }}>⌕</span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search your passages…"
            className="flex-1 border-none bg-transparent font-sans text-sm focus:outline-none"
            style={{ color: 'rgb(var(--fg))' }}
          />
          <button
            type="button"
            onClick={() => setFavOnly((v) => !v)}
            aria-label="Show favorites only"
            className="flex items-center border-none bg-transparent p-1"
            style={{ color: favOnly ? '#D6584B' : 'rgb(var(--fg) / .4)' }}
          >
            <HeartIcon size={17} filled={favOnly} />
          </button>
        </div>

        <div className="mt-3 flex gap-1.5 rounded-xl p-1" style={{ background: 'rgb(var(--fg) / .06)' }}>
          <button
            type="button"
            onClick={() => {
              setGrouped(false);
              setSwipedId(null);
            }}
            className="h-10 flex-1 rounded-lg border-none font-sans text-[13px] font-semibold"
            style={{
              background: !grouped ? 'rgb(var(--fg) / .14)' : 'transparent',
              color: !grouped ? 'rgb(var(--fg))' : 'rgb(var(--fg) / .5)',
            }}
          >
            Recent
          </button>
          <button
            type="button"
            onClick={() => {
              setGrouped(true);
              setSwipedId(null);
            }}
            className="h-10 flex-1 rounded-lg border-none font-sans text-[13px] font-semibold"
            style={{
              background: grouped ? 'rgb(var(--fg) / .14)' : 'transparent',
              color: grouped ? 'rgb(var(--fg))' : 'rgb(var(--fg) / .5)',
            }}
          >
            By title
          </button>
        </div>
      </div>

      <div
        onScroll={() => swipedId && setSwipedId(null)}
        className="min-h-0 flex-1 overflow-y-auto px-[18px] pb-6"
      >
        {!grouped &&
          filtered.map((passage) => (
            <div key={passage.id} className="mt-3">
              <PassageCard
                passage={passage}
                grouped={false}
                {...cardProps}
                isOpen={swipedId === passage.id}
                flash={flashId === passage.id}
              />
            </div>
          ))}

        {grouped &&
          groupedEntries.map(([title, items]) => {
            const author = items.map((p) => p.sourceAuthor).find(Boolean) || null;
            const open = !!expandedGroups[title];
            return (
              <div key={title}>
                <button
                  type="button"
                  onClick={() => toggleGroup(title)}
                  className="mt-2.5 flex w-full items-center gap-2.5 border px-[15px] py-3.5 text-left"
                  style={{
                    background: 'rgb(var(--fg) / .04)',
                    borderColor: 'rgb(var(--fg) / .1)',
                    borderRadius: 'var(--radius)',
                  }}
                >
                  <span className="w-3 shrink-0 text-[11px]" style={{ color: 'rgb(var(--fg) / .5)' }}>
                    {open ? '▾' : '▸'}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-serif text-[17px] leading-[1.2]" style={{ color: 'rgb(var(--fg))' }}>
                      {title}
                    </span>
                    {author && (
                      <span className="mt-0.5 block font-sans text-[11.5px] tracking-wide" style={{ color: 'rgb(var(--fg) / .45)' }}>
                        {author}
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 font-sans text-xs" style={{ color: 'rgb(var(--fg) / .4)' }}>
                    {items.length}
                  </span>
                </button>
                {open &&
                  items.map((passage) => (
                    <div key={passage.id} className="mt-3">
                      <PassageCard
                        passage={passage}
                        grouped
                        {...cardProps}
                        isOpen={swipedId === passage.id}
                        flash={flashId === passage.id}
                      />
                    </div>
                  ))}
              </div>
            );
          })}

        {filtered.length === 0 && (
          <div className="py-16 text-center">
            <p className="font-serif text-xl italic" style={{ color: 'rgb(var(--fg) / .7)' }}>
              Nothing matches that.
            </p>
          </div>
        )}
      </div>

      {deleted && (
        <div
          className="absolute inset-x-4 bottom-4 z-30 flex items-center justify-between gap-3 rounded-[14px] py-2.5 pr-3 pl-4 shadow-lg"
          style={{ background: 'var(--raised)', border: '1px solid rgb(var(--fg) / .22)' }}
        >
          <span className="font-sans text-[13.5px]" style={{ color: 'rgb(var(--fg))' }}>
            Passage deleted
          </span>
          <button
            type="button"
            onClick={undoDelete}
            className="flex items-center gap-1.5 rounded-full border px-3.5 py-2 font-sans text-[13px] font-semibold"
            style={{ background: 'rgb(var(--acc) / .14)', borderColor: 'rgb(var(--acc) / .4)', color: 'rgb(var(--acc))' }}
          >
            <span className="text-[17px] leading-none">↺</span> Undo
          </button>
        </div>
      )}

      <SettingsDrawer open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}
