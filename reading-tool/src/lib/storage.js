import { supabase } from './supabaseClient.js';

const CURRENT_SOURCE_TITLE_KEY = 'current_source_title';
const CURRENT_SOURCE_AUTHOR_KEY = 'current_source_author';
const CURRENT_PAGE_KEY = 'current_page';

// DB rows are snake_case; the rest of the app works with the same
// camelCase passage shape it always has, unchanged since the localStorage
// days — these two mappers are the only place that needs to know about the
// DB's column names.
const fromRow = (row) => ({
  id: row.id,
  capturedAt: row.captured_at,
  rawText: row.raw_text,
  refinedText: row.refined_text,
  context: row.context,
  pageNumber: row.page_number,
  sourceTitle: row.source_title,
  sourceAuthor: row.source_author,
  selectionBounds: row.selection_bounds,
  touchPath: row.touch_path,
  isMerged: row.is_merged,
  mergedFromIds: row.merged_from_ids,
  priority: row.priority,
  audioTranscript: row.audio_transcript,
  stackId: row.stack_id,
});

// Only maps fields actually present on `passage` — an update with just
// `{ priority: true }` produces a row with every other key `undefined`,
// which JSON.stringify (and so the request body) drops entirely, so a
// partial update only ever touches the columns it's given.
const toRow = (passage, userId) => ({
  id: passage.id,
  user_id: userId,
  captured_at: passage.capturedAt,
  raw_text: passage.rawText,
  refined_text: passage.refinedText,
  context: passage.context,
  page_number: passage.pageNumber,
  source_title: passage.sourceTitle,
  source_author: passage.sourceAuthor,
  selection_bounds: passage.selectionBounds,
  touch_path: passage.touchPath,
  is_merged: passage.isMerged,
  merged_from_ids: passage.mergedFromIds,
  priority: passage.priority,
  audio_transcript: passage.audioTranscript,
  stack_id: passage.stackId,
});

// Reads the locally-cached session (no network round trip — Supabase's own
// per-request auth header/RLS check is what actually enforces access, this
// is just for building request payloads that need a user id).
const getUserId = async () => {
  const { data } = await supabase.auth.getSession();
  return data.session?.user?.id ?? null;
};

export const getPassages = async () => {
  const { data, error } = await supabase.from('passages').select('*').order('captured_at', { ascending: false });
  if (error) return [];
  return data.map(fromRow);
};

export const savePassage = async (passage) => {
  const userId = await getUserId();
  if (!userId) return { ok: false, error: new Error('Not signed in') };
  const { error } = await supabase.from('passages').insert(toRow(passage, userId));
  return { ok: !error, error };
};

export const deletePassage = async (id) => {
  const { error } = await supabase.from('passages').delete().eq('id', id);
  return { ok: !error, error };
};

export const getPassage = async (id) => {
  const { data, error } = await supabase.from('passages').select('*').eq('id', id).maybeSingle();
  if (error || !data) return null;
  return fromRow(data);
};

// Partial update — see toRow's comment on why passing a subset of fields is
// safe. Never lets id/user_id be touched through this path.
export const updatePassage = async (id, updates) => {
  const patch = toRow(updates, undefined);
  delete patch.id;
  delete patch.user_id;
  const { error } = await supabase.from('passages').update(patch).eq('id', id);
  return { ok: !error, error };
};

// Swaps two passage entries for one merged entry. Not a single DB
// transaction (two round trips) — a failure between the delete and the
// insert could in principle leave things inconsistent, which is an
// accepted simplification for how rarely continuation-merge fails at all.
export const replacePassages = async (idsToRemove, newPassage) => {
  const userId = await getUserId();
  if (!userId) return { ok: false, error: new Error('Not signed in') };
  const { error: delError } = await supabase.from('passages').delete().in('id', idsToRemove);
  if (delError) return { ok: false, error: delError };
  const { error: insError } = await supabase.from('passages').insert(toRow(newPassage, userId));
  return { ok: !insError, error: insError };
};

export const clearAllPassages = async () => {
  const userId = await getUserId();
  if (!userId) return { ok: false, error: new Error('Not signed in') };
  const { error } = await supabase.from('passages').delete().eq('user_id', userId);
  return { ok: !error, error };
};

// The "currently logged" source title, set via the triple-tap gesture on
// the title page. Attached to every passage saved while active — a plain
// string tag for now, not a grouping entity (see PROGRESS.md). Deliberately
// stays in localStorage rather than the DB — it's "what am I capturing on
// this device right now" session state, not data worth syncing/sharing.
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
