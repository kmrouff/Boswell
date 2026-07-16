import { useState } from 'react';

// Full-screen typing interface for entering a title (+ optional author) by
// hand, in large bold letters. Reached by tapping once (not triple-tapping)
// in title mode.
export default function TitleTypingOverlay({ initialValue = '', initialAuthor = '', onSubmit, onCancel }) {
  const [value, setValue] = useState(initialValue);
  const [author, setAuthor] = useState(initialAuthor);

  const submit = () => {
    const trimmed = value.trim();
    if (trimmed) onSubmit(trimmed, author.trim() || null);
    else onCancel();
  };

  return (
    <div className="absolute inset-0 z-30 flex flex-col justify-center gap-6 bg-ink/95 px-6">
      <div>
        <label className="text-sm uppercase tracking-wide text-parchment/50">Title</label>
        <input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit();
          }}
          placeholder="Type the title…"
          className="mt-1 w-full border-b-2 border-parchment/30 bg-transparent pb-2 text-3xl font-bold text-parchment placeholder:text-parchment/30 focus:border-amber-300 focus:outline-none"
        />
      </div>
      <div>
        <label className="text-sm uppercase tracking-wide text-parchment/50">Author (optional)</label>
        <input
          value={author}
          onChange={(e) => setAuthor(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit();
          }}
          placeholder="Author…"
          className="mt-1 w-full border-b border-parchment/20 bg-transparent pb-2 text-lg text-parchment placeholder:text-parchment/25 focus:border-amber-300 focus:outline-none"
        />
      </div>
      <div className="flex gap-3">
        <button
          type="button"
          onClick={submit}
          className="rounded-lg bg-amber-300 px-5 py-2 font-medium text-ink"
        >
          Save title
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-parchment/30 px-5 py-2 text-parchment"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
