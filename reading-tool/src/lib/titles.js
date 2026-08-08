// Titles are matched by exact string equality everywhere they matter: the
// Library groups by `sourceTitle`, counts distinct titles with a Set, and
// scopes the "stack with…" picker to passages sharing one. That makes the
// exact characters load-bearing, and they come from OCR of a photographed
// cover, which will not reproduce them identically twice. Reading the same
// book across two sittings could easily yield "Memoirs of Hecate County"
// once and "MEMOIRS OF HECATE COUNTY" or "Memoirs of Hecate County." the
// next, splitting one book into two groups.
//
// Rather than make every comparison fuzzy, a new title is reconciled against
// the ones already in use at the point it is set, and the existing spelling
// is reused when they refer to the same book. One canonical string per book
// means the rest of the app can keep comparing exactly.

// Aggressive on purpose: case, accents, punctuation and spacing are all
// noise from OCR's point of view, and a leading article is a common
// difference between a cover and a title page.
export const normalizeTitle = (title) =>
  (title || '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/^(the|a|an)\s+/, '')
    .replace(/\s+/g, ' ')
    .trim();

// Returns whichever spelling of this title is already in use, or the
// candidate unchanged when it is genuinely new. `existing` is the list of
// titles already on saved passages, newest first, so the most recent
// spelling wins if a book somehow ended up with several.
export const canonicalizeTitle = (candidate, existing = []) => {
  const key = normalizeTitle(candidate);
  if (!key) return candidate;
  const match = existing.find((t) => normalizeTitle(t) === key);
  return match || candidate;
};
