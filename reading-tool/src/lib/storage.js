const DB_KEY = 'passages_db';
const CURRENT_SOURCE_TITLE_KEY = 'current_source_title';

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

// The "currently logged" source title, set via the triple-tap gesture on
// the title page. Attached to every passage saved while active — a plain
// string tag for now, not a grouping entity (see PROGRESS.md).
export const getCurrentSourceTitle = () => localStorage.getItem(CURRENT_SOURCE_TITLE_KEY) || null;

export const setCurrentSourceTitle = (title) => {
  localStorage.setItem(CURRENT_SOURCE_TITLE_KEY, title);
};
