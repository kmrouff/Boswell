const DB_KEY = 'passages_db';
const CURRENT_SOURCE_TITLE_KEY = 'current_source_title';
const CURRENT_SOURCE_AUTHOR_KEY = 'current_source_author';
const CURRENT_PAGE_KEY = 'current_page';

export const getPassages = () => {
  try {
    const raw = localStorage.getItem(DB_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
};

const writePassages = (passages) => {
  try {
    localStorage.setItem(DB_KEY, JSON.stringify(passages));
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err };
  }
};

export const savePassage = (passage) => {
  const passages = getPassages();
  passages.unshift(passage);
  return writePassages(passages);
};

export const deletePassage = (id) => {
  const passages = getPassages().filter((p) => p.id !== id);
  return writePassages(passages);
};

export const getPassage = (id) => getPassages().find((p) => p.id === id) ?? null;

export const updatePassage = (id, updates) => {
  const passages = getPassages().map((p) => (p.id === id ? { ...p, ...updates } : p));
  return writePassages(passages);
};

// Atomically swaps two passage entries (by id) for one merged entry.
// Used by continuation-detection to combine a passage split across a page break.
export const replacePassages = (idsToRemove, newPassage) => {
  const passages = getPassages().filter((p) => !idsToRemove.includes(p.id));
  passages.unshift(newPassage);
  return writePassages(passages);
};

export const clearAllPassages = () => writePassages([]);

// Cross-browser check for a localStorage quota error, so callers can offer a
// "free up space" recovery instead of just failing silently.
export const isQuotaExceededError = (err) =>
  err instanceof DOMException &&
  (err.name === 'QuotaExceededError' || err.name === 'NS_ERROR_DOM_QUOTA_REACHED' || err.code === 22 || err.code === 1014);

// Drops the oldest N passages (the end of the array, since new ones are
// unshifted to the front) to recover from a quota error.
export const deleteOldestPassages = (count) => {
  const passages = getPassages();
  return writePassages(passages.slice(0, Math.max(0, passages.length - count)));
};

// Re-inserts a passage at a specific index — used to restore a deleted
// passage to its original position for the Library undo snackbar, rather
// than always landing back at the front like a fresh capture would.
export const insertPassageAt = (index, passage) => {
  const passages = getPassages();
  passages.splice(Math.max(0, Math.min(index, passages.length)), 0, passage);
  return writePassages(passages);
};

// The "currently logged" source title, set via the triple-tap gesture on
// the title page. Attached to every passage saved while active — a plain
// string tag for now, not a grouping entity (see PROGRESS.md).
export const getCurrentSourceTitle = () => localStorage.getItem(CURRENT_SOURCE_TITLE_KEY) || null;

export const setCurrentSourceTitle = (title) => {
  localStorage.setItem(CURRENT_SOURCE_TITLE_KEY, title);
};

// Companion to the source title — the author, captured/typed/dictated
// alongside the title (see lib/claude.js extractTitle and the title-mode
// overlays). Attached to every passage saved while active, same as title.
export const getCurrentSourceAuthor = () => localStorage.getItem(CURRENT_SOURCE_AUTHOR_KEY) || null;

export const setCurrentSourceAuthor = (author) => {
  if (author == null || author === '') localStorage.removeItem(CURRENT_SOURCE_AUTHOR_KEY);
  else localStorage.setItem(CURRENT_SOURCE_AUTHOR_KEY, author);
};

// The "working" page number shown on the capture screen — seeded by a one-shot
// detection, updated by captures that see a page number, and manually
// adjustable. Attached to captures that don't detect their own page number.
export const getCurrentPage = () => localStorage.getItem(CURRENT_PAGE_KEY) || null;

export const setCurrentPage = (page) => {
  if (page == null || page === '') localStorage.removeItem(CURRENT_PAGE_KEY);
  else localStorage.setItem(CURRENT_PAGE_KEY, String(page));
};
