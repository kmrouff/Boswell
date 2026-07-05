const DB_KEY = 'passages_db';

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
