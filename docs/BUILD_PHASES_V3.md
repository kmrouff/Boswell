# Build Phases — Reading Annotation Tool Prototype (v3)

Use this alongside `READING_TOOL_PROTOTYPE_SPEC_V3.md`, which supersedes v2. The capture model changed from a dragging-camera/multi-frame approach to a static-camera + touch-drag-to-select approach — this is simpler to build than the v2 phases were, since there's no more frame-sequence stitching or dual underline/margin modes to maintain.

## How to use this

Same as before: run each phase as its own Claude Code session, commit to git at the end of each, update PROGRESS.md, resume next session by pointing Claude Code at PROGRESS.md + the v3 spec.

---

## Phase 0 — Scaffold + Storage

Unchanged from v2. Vite/React/Tailwind setup, three-view navigation shell, `lib/storage.js` fully implemented and manually verified with a dummy passage.

**Commit message:** `Phase 0: scaffold + storage layer`

---

## Phase 1 — Claude API layer (single-image, no sequences)

**Goal:** `lib/claude.js` implemented and verified in isolation before any UI wiring.

- `extractPassage(imageBase64)` — single cropped image in, structured passage out
- `checkContinuation(previousPassage, newPassage)` — the merge-check function
- `chatWithPassages(messages, passagesArray)` with streaming

**Test assets needed:** just **2-3 single, sharp, static photos** of real text (a book or printed page, camera held still, no motion) — no sequences, no finger, no pointer. This is simpler than v2 required. Put them in `test-assets/`.

**Note to Claude Code:** if no sample images exist, ask the user to drop 2-3 plain static photos of text into `test-assets/` before proceeding. Verify `extractPassage` returns sensible JSON, and manually construct two fake passage objects (one ending mid-sentence, one continuing it) to test `checkContinuation` returns `isContinuation: true` with a sensible merge.

**Done when:** both functions verified against real Claude API calls with test data, output logged/displayed for manual inspection.

**Commit message:** `Phase 1: Claude API layer verified with test data`

---

## Phase 2 — Capture view: camera + touch-drag selection (no AI wiring yet)

**Goal:** Static camera view with working touch-drag tracking and live selection band, producing a correctly-cropped image in memory — verified by displaying the crop, not yet sending it anywhere.

- Rear camera stream, static, wide-angle best-effort
- Touch tracking: record full `touchPath` (normalized coordinates + timestamps) on touchstart/move/end
- Live selection band overlay following the drag
- On touch-end: compute `selectionBounds` (min/max Y + buffer margin), crop the current video frame to that region
- Minimum-drag threshold to ignore accidental taps
- Haptic tick on touch-start and touch-end
- Display the cropped result on-screen temporarily (debug view) to confirm the crop is correct before wiring to Claude

**Done when:** on your phone, dragging over a real passage shows the live band correctly, and releasing shows a correctly-cropped image of just that region.

**Commit message:** `Phase 2: touch-drag capture producing correct crops`

---

## Phase 3 — Wire capture to Claude + instant save + undo

**Goal:** Full non-blocking end-to-end flow: drag → crop → async extraction → instant save → toast/undo.

- Connect Phase 2 crop to Phase 1 `extractPassage`
- Async, non-blocking — UI returns to ready state immediately on touch-end, not waiting on the API call
- Support multiple simultaneous in-flight extractions if the user gestures again quickly
- On success: save immediately to storage (Phase 0 layer), show toast + Undo (auto-dismiss ~4s)
- On failure: brief non-blocking toast, discard silently

**Done when:** you can drag-capture a real passage on your phone and it appears in storage moments later without ever blocking you from reading or gesturing again.

**Commit message:** `Phase 3: instant capture-to-save flow with undo`

---

## Phase 4 — Continuation detection

**Goal:** Automatic merging of passages that span a page break, with no user-facing interaction.

- Heuristic pre-filter (bottom-of-frame → top-of-frame + missing terminal punctuation) run after every new save, comparing to the immediately-preceding passage
- When the heuristic flags a candidate: call `checkContinuation`
- If merged: use `replacePassages` to atomically swap the two entries for one merged entry
- Test explicitly with a real two-page example (capture the bottom of one page, then the top of the next) to confirm it merges correctly, and with two clearly unrelated passages to confirm it correctly does *not* merge

**Done when:** the obvious continuation case merges correctly and an obvious non-continuation case doesn't, without any visible prompt or interruption either way.

**Commit message:** `Phase 4: automatic continuation detection`

---

## Phase 5 — Voice notes

**Goal:** Voice recording attaches to the most recently saved passage.

- Persistent record button, always visible on Capture screen
- MediaRecorder + base64 storage + playback
- Attaches to whichever passage was most recently saved at time of stopping
- Graceful handling if no passage exists yet

**Commit message:** `Phase 5: voice notes`

---

## Phase 6 — Library view

Unchanged from v2 in spirit: list, expand, delete, empty state, audio playback. Should now also correctly display merged passages (just as a single normal-looking entry — merging should be invisible in the UI).

**Commit message:** `Phase 6: library view`

---

## Phase 7 — Chat view

Unchanged from v2: full passage context injection, streaming, empty state suggestions, clear chat.

**Commit message:** `Phase 7: chat view complete`

---

## Phase 8 — Polish pass

- All error states from the v3 spec
- Wide-angle fallback behaviour
- Accidental-tap rejection feels right in practice (tune the threshold if needed)
- Continuation detection heuristic thresholds tuned based on real testing (adjust the 0.85/0.15 bounds if they're too strict/loose in practice)
- General mobile UX pass across several real real-world capture attempts

**Commit message:** `Phase 8: polish and error handling`

---

## PROGRESS.md

Same file as before — just update the phase list to match the 9 phases above (0 through 8) rather than the old v2 set. If you already created PROGRESS.md against the v2 phase list and haven't started building yet, just replace its contents with the updated list below. If you've already completed v2 Phase 0 (scaffold + storage), that work carries over unchanged — no need to redo it.

```markdown
# Progress

- [ ] Phase 0 — Scaffold + Storage
- [ ] Phase 1 — Claude API layer (single-image + continuation check)
- [ ] Phase 2 — Capture view (camera + touch-drag selection)
- [ ] Phase 3 — Wire capture to Claude + instant save + undo
- [ ] Phase 4 — Continuation detection
- [ ] Phase 5 — Voice notes
- [ ] Phase 6 — Library view
- [ ] Phase 7 — Chat view
- [ ] Phase 8 — Polish pass

## Notes
(Claude Code: add a short note here after each phase — what was built, any deviations from spec, anything the user should know before the next session)
```
