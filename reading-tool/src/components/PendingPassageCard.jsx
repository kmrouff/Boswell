// Stand-in for a capture that's still being read/saved — same card shape as
// PassageCard so it doesn't look like a different kind of thing, just an
// unfinished one. Purely cosmetic: no id-based logic lives here, the actual
// pending/resolved bookkeeping is all in LibraryView.
export default function PendingPassageCard() {
  return (
    <div
      className="border p-[18px]"
      style={{ borderColor: 'rgb(var(--fg) / .1)', background: 'var(--surface)', borderRadius: 'var(--radius)' }}
    >
      <div className="flex animate-pulse flex-col gap-2">
        <div className="h-3 rounded-full" style={{ width: '92%', background: 'rgb(var(--fg) / .12)' }} />
        <div className="h-3 rounded-full" style={{ width: '68%', background: 'rgb(var(--fg) / .12)' }} />
      </div>
      <p className="mt-3 font-serif text-xs italic" style={{ color: 'rgb(var(--fg) / .4)' }}>
        Reading…
      </p>
    </div>
  );
}
