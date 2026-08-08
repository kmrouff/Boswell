import { v4 as uuidv4 } from 'uuid';
import { checkContinuation } from './claude.js';
import { getPassages, replacePassages } from './storage.js';

const BOTTOM_OF_FRAME_THRESHOLD = 0.85;
const TOP_OF_FRAME_THRESHOLD = 0.15;

// A continuation only makes sense for two captures taken moments apart —
// the same book, the same sitting, one page turn between them. Without this
// bound, `passages[1]` is simply "the second-newest passage I have ever
// captured", so a single capture today could be merged into something from
// weeks ago purely because the two happened to satisfy the cheap
// bounds/punctuation heuristic. Generous enough to cover turning a page and
// repositioning the camera, but firmly scoped to one reading session.
// (Same reasoning as capture.js's RECENT_CAPTURE_WINDOW_MS for buffer
// de-duplication, which has always had such a bound; this path was missing
// its equivalent.)
const MAX_CONTINUATION_GAP_MS = 120000;

const missingTerminalPunctuation = (text) => {
  const trimmed = (text || '').trim();
  if (!trimmed) return false;
  // No ./!/? at the end (this also naturally covers a hyphenated
  // mid-word line break, since a trailing "-" doesn't match either).
  return !/[.!?]$/.test(trimmed);
};

// Cheap, local, no-API-call pre-filter. At least 2 of 3 conditions must hold
// for a pair to be worth spending a real Claude call to check.
export const isCandidateContinuation = (prevPassage, newPassage) => {
  const conditions = [
    (prevPassage.selectionBounds?.yMax ?? 0) > BOTTOM_OF_FRAME_THRESHOLD,
    (newPassage.selectionBounds?.yMin ?? 1) < TOP_OF_FRAME_THRESHOLD,
    missingTerminalPunctuation(prevPassage.refinedText),
  ];
  return conditions.filter(Boolean).length >= 2;
};

// Runs automatically after a passage is saved, comparing it to the
// immediately-preceding passage in storage. Entirely invisible to the user:
// merges silently when confirmed, does nothing silently otherwise, and never
// throws or blocks — any failure just leaves both passages as separate
// entries (the safe default).
export const maybeMergeWithPrevious = async (newPassage) => {
  try {
    const passages = await getPassages();
    // newPassage was just unshifted onto the front, so index 1 is whatever
    // was most recently captured before it.
    const prevPassage = passages[1];
    if (!prevPassage) return;

    // Bail unless the two were captured within one reading session of each
    // other — see MAX_CONTINUATION_GAP_MS.
    const gapMs = Date.parse(newPassage.capturedAt) - Date.parse(prevPassage.capturedAt);
    if (!Number.isFinite(gapMs) || gapMs > MAX_CONTINUATION_GAP_MS) return;

    if (!isCandidateContinuation(prevPassage, newPassage)) return;

    const result = await checkContinuation(prevPassage, newPassage);
    if (!result.isContinuation || !result.mergedText) return;

    const merged = {
      id: uuidv4(),
      // The *newer* timestamp, deliberately. The Library sorts by
      // captured_at descending, so inheriting prevPassage's time would drop
      // the merged result back to the older passage's position in the list —
      // from the user's point of view the capture they just made silently
      // vanishes from the top of their Library, which reads as "it didn't
      // save" even though the text is there.
      capturedAt: newPassage.capturedAt,
      rawText: `${prevPassage.rawText}\n\n${newPassage.rawText}`,
      refinedText: result.mergedText,
      context: prevPassage.context,
      pageNumber: prevPassage.pageNumber,
      sourceTitle: prevPassage.sourceTitle,
      sourceAuthor: prevPassage.sourceAuthor ?? newPassage.sourceAuthor ?? null,
      stackId: prevPassage.stackId ?? newPassage.stackId ?? null,
      touchPath: [...(prevPassage.touchPath ?? []), ...(newPassage.touchPath ?? [])],
      selectionBounds: prevPassage.selectionBounds,
      isMerged: true,
      // prevPassage.mergedFromIds is always [] for a fresh (non-merged)
      // passage, not nullish — so this has to branch on isMerged, not on
      // mergedFromIds being empty, or a fresh passage's own id gets dropped.
      mergedFromIds: [...(prevPassage.isMerged ? prevPassage.mergedFromIds : [prevPassage.id]), newPassage.id],
      priority: prevPassage.priority || newPassage.priority || false,
      audioTranscript: prevPassage.audioTranscript ?? newPassage.audioTranscript ?? null,
    };

    const { ok } = await replacePassages([prevPassage.id, newPassage.id], merged);
    // Without this the merge is invisible to an already-open Library: the
    // two original rows are gone and the merged one exists, but nothing
    // tells the list to re-read, so it keeps rendering the pre-merge state
    // until some unrelated event happens to refresh it.
    if (ok) {
      window.dispatchEvent(new CustomEvent('passage-saved', { detail: { id: merged.id } }));
    }
  } catch {
    // Fail silently and safely — leave both passages separate.
  }
};
