import { v4 as uuidv4 } from 'uuid';
import { checkContinuation } from './claude.js';
import { getPassages, replacePassages } from './storage.js';

const BOTTOM_OF_FRAME_THRESHOLD = 0.85;
const TOP_OF_FRAME_THRESHOLD = 0.15;

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
    const passages = getPassages();
    // newPassage was just unshifted onto the front, so index 1 is whatever
    // was most recently captured before it.
    const prevPassage = passages[1];
    if (!prevPassage) return;

    if (!isCandidateContinuation(prevPassage, newPassage)) return;

    const result = await checkContinuation(prevPassage, newPassage);
    if (!result.isContinuation || !result.mergedText) return;

    const merged = {
      id: uuidv4(),
      capturedAt: prevPassage.capturedAt,
      rawText: `${prevPassage.rawText}\n\n${newPassage.rawText}`,
      refinedText: result.mergedText,
      context: prevPassage.context,
      pageNumber: prevPassage.pageNumber,
      sourceTitle: prevPassage.sourceTitle,
      touchPath: [...(prevPassage.touchPath ?? []), ...(newPassage.touchPath ?? [])],
      selectionBounds: prevPassage.selectionBounds,
      isMerged: true,
      // prevPassage.mergedFromIds is always [] for a fresh (non-merged)
      // passage, not nullish — so this has to branch on isMerged, not on
      // mergedFromIds being empty, or a fresh passage's own id gets dropped.
      mergedFromIds: [...(prevPassage.isMerged ? prevPassage.mergedFromIds : [prevPassage.id]), newPassage.id],
      imageThumb: prevPassage.imageThumb,
      audioNote: prevPassage.audioNote ?? newPassage.audioNote ?? null,
      audioTranscript: prevPassage.audioTranscript ?? newPassage.audioTranscript ?? null,
    };

    replacePassages([prevPassage.id, newPassage.id], merged);
  } catch {
    // Fail silently and safely — leave both passages separate.
  }
};
