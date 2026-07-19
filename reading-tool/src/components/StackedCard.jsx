// Collapsed view of 2+ passages captured together in one spree (see
// CaptureView's "Captured N" bubble / stackId). Shows the newest member's
// excerpt with two faint ghost layers peeking out behind it to read as a
// stack of cards, plus a count badge. Tapping expands it in place — see
// LibraryView, which swaps this for the individual PassageCards on expand.
export default function StackedCard({ members, onExpand }) {
  const top = members[0];
  const metaText = [top.sourceTitle, top.sourceAuthor].filter(Boolean).join('  ·  ');

  return (
    <div className="relative">
      <div
        className="absolute inset-0 translate-x-1.5 translate-y-2 border opacity-45"
        style={{ background: 'var(--surface)', borderRadius: 'var(--radius)', borderColor: 'rgb(var(--fg) / .1)' }}
      />
      <div
        className="absolute inset-0 translate-x-[3px] translate-y-1 border opacity-70"
        style={{ background: 'var(--surface)', borderRadius: 'var(--radius)', borderColor: 'rgb(var(--fg) / .1)' }}
      />
      <button
        type="button"
        onClick={onExpand}
        className="relative w-full border p-[18px] text-left"
        style={{ borderColor: 'rgb(var(--fg) / .1)', background: 'var(--surface)', borderRadius: 'var(--radius)' }}
      >
        <div className="flex items-start justify-between gap-3">
          <p
            className="m-0 flex-1 font-serif text-[19px] leading-[1.45] line-clamp-2"
            style={{ color: 'rgb(var(--fg))', maxHeight: '55px' }}
          >
            {top.refinedText}
          </p>
          <span
            className="shrink-0 rounded-full px-2.5 py-1 font-sans text-[11px] font-bold"
            style={{ background: 'rgb(var(--acc) / .16)', color: 'rgb(var(--acc))' }}
          >
            ×{members.length}
          </span>
        </div>

        {metaText && (
          <p className="mt-3.5 font-sans text-[12px]" style={{ color: 'rgb(var(--fg) / .5)' }}>
            {metaText}
          </p>
        )}

        <p className="mt-3 font-sans text-[11px]" style={{ color: 'rgb(var(--fg) / .4)' }}>
          Captured together · tap to view all {members.length}
        </p>
      </button>
    </div>
  );
}
