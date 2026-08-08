# Prototype Build Spec v3: Reading Annotation Tool
**For Claude Code — execute autonomously end to end**

Supersedes v2. The core interaction model has changed: v2 attempted to simulate a physically-dragged pen camera, which testing revealed causes unworkable motion blur at close range (a real optical constraint, not a phone limitation — this is why real smart pens track position separately from reading content). v3 replaces this with a static camera + touch-drag selection model, which sidesteps the blur problem entirely while still producing an instant, low-friction capture flow. Camera hardware improvements (fast shutter, stabilization) that could eventually enable true pen-dragging are a separate hardware R&D question, out of scope for this software prototype.

---

## What You Are Building

A mobile-first web app. The phone's camera stays relatively static, pointed at a page. The user's thumb, dragged vertically on the touchscreen over the live camera feed, acts as the "pen" — indicating which text to capture. The moment the thumb lifts, that region is captured, extracted, and stored automatically. No confirm screen, no save button — capture is instant and non-blocking, so it never interrupts the act of reading.

Interaction:
1. Live camera view is always showing (rear camera, static-ish, held back enough to see a full passage)
2. User presses their thumb down on the screen at the top of a passage of interest and drags down to the bottom of it (or vice versa)
3. While dragging, a translucent colored band overlay tracks the vertical extent of the drag, giving live visual feedback of what's being selected (full width of screen)
4. On thumb release: the app immediately crops the current camera frame to that vertical band (plus a buffer margin), fires an async Claude extraction call, and returns instantly to a ready state — the user can gesture again right away, even while the previous extraction is still processing
5. When extraction completes, the passage is saved automatically. A small toast appears briefly ("Captured") with an "Undo" option, then auto-dismisses
6. In the background, a lightweight check runs to detect whether this passage is a continuation of the previous one (e.g. bottom-of-page → top-of-next-page) and merges them automatically if so — no user interaction involved
7. A separate, always-visible voice button lets the user record a note attached to the most recent passage, independent of the drag gesture

---

## Tech Stack

Unchanged from v2: React (Vite), Tailwind CDN, Claude API (`claude-sonnet-4-6`) called client-side, `localStorage`, Web Vibration API, `getUserMedia`, no backend.

API key from `import.meta.env.VITE_ANTHROPIC_API_KEY`.

---

## Project Structure

```
reading-tool/
├── .env / .env.example
├── index.html / vite.config.js / package.json
├── src/
│   ├── main.jsx / App.jsx / index.css
│   ├── lib/
│   │   ├── claude.js          # extraction, continuation-check, chat
│   │   ├── storage.js         # localStorage helpers
│   │   └── capture.js         # touch tracking, crop logic
│   └── components/
│       ├── CaptureView.jsx    # camera + touch-drag overlay
│       ├── SelectionBand.jsx  # live drag feedback overlay
│       ├── UndoToast.jsx
│       ├── PassageCard.jsx
│       ├── LibraryView.jsx
│       └── ChatView.jsx
```

---

## Data Model

```json
{
  "id": "uuid-v4",
  "capturedAt": "ISO8601 timestamp",
  "rawText": "Full text extracted, with buffer",
  "refinedText": "Semantically trimmed target passage",
  "context": "Brief description of source type",
  "touchPath": [{ "x": 0.42, "y": 0.10, "t": 0 }, { "x": 0.43, "y": 0.25, "t": 120 }],
  "selectionBounds": { "yMin": 0.10, "yMax": 0.62 },
  "isMerged": false,
  "mergedFromIds": [],
  "imageThumb": "base64 JPEG thumbnail, max 400px wide",
  "audioNote": "base64 audio blob or null",
  "audioTranscript": "string or null"
}
```

Notes:
- `touchPath` stores the **full** sequence of touch points (normalized 0-1 coordinates relative to video element, plus timestamp), not just min/max. v1 logic only uses `selectionBounds` (derived min/max Y) for cropping, but the full path is retained so future work can support arbitrary shape/region gestures without changing what's captured — only how it's interpreted. Do not discard this data even though v1 doesn't use it beyond bounding box extraction.
- `isMerged` / `mergedFromIds`: set when the continuation-detection logic (see below) merges two captures into one passage. Keep the original two passages' data referenced in case the merge needs to be undone or inspected later.

`localStorage` key: `"passages_db"` → JSON array.

---

## App Views / Navigation

Same three-tab structure: Capture (default) / Library / Chat.

---

## View 1: Capture

### Camera + overlay

- Full-screen rear camera preview, portrait, widest available FOV (best-effort constraint per v2 approach — try zoom<1 first, fall back gracefully)
- No pen-tip icon overlay anymore (that was for the dragging-camera model). Instead: while the user's thumb is down and moving, render a **translucent colored horizontal band** spanning the full width of the screen, from the initial touch Y-position to the current touch Y-position, updating live as the thumb moves. This is the primary visual feedback — simple, immediate, legible.
- Idle state (no active touch): no overlay, just the clean camera view, so it doesn't get in the way of reading/aiming
- Small persistent hint text on first use only (dismissible, don't repeat every session): *"Drag down over text to capture"*

### Touch tracking (`lib/capture.js`)

```
onTouchStart:
  - record { x, y, t: 0 } (normalized to video element dimensions)
  - begin tracking, start rendering the selection band
  - light haptic tick (navigator.vibrate(10))

onTouchMove (while pressed):
  - append { x, y, t } to the in-progress touchPath array
  - update selection band to span from touchPath[0].y to current y

onTouchEnd:
  - append final point
  - haptic tick (navigator.vibrate(10))
  - compute selectionBounds: { yMin: min of all y, yMax: max of all y } with a buffer added (expand yMin up and yMax down by a small margin, e.g. 5% of frame height, to catch text right at the edges of the drag)
  - capture current video frame, crop to full width × [yMin, yMax] in that frame's pixel space
  - clear the live selection band immediately (don't wait for processing) — camera returns to idle/ready state right away
  - kick off async extraction (see below) — do not block the UI on this
```

- Minimum drag distance: if a touch is essentially a tap (start/end Y nearly identical), ignore it — don't fire a capture for an accidental tap. Use a small threshold (e.g. requires at least ~3% of screen height of vertical movement).
- No maximum — a long drag just captures a taller region. If it captures more than fits usefully in one Claude call, that's an acceptable edge case for now (not explicitly handled).

### Async extraction + instant storage

- On touch-end, call `extractPassage(croppedImageBase64)` (see Claude API section) without blocking the UI
- Multiple extractions can be in flight simultaneously if the user gestures again quickly — track them independently, each resolving into its own stored passage when ready
- When an extraction resolves successfully: save the passage to storage immediately (no user confirmation step), then run the continuation check (below) against the immediately-preceding passage
- Show a lightweight toast: "Captured" + an "Undo" button, auto-dismissing after ~4 seconds. Tapping Undo within that window deletes the just-saved passage (or, if it was auto-merged with the previous one, reverts the merge and restores both originals — keep this simple, doesn't need to be perfect)
- If extraction fails or returns `{ error }`: show a brief, non-blocking toast ("Couldn't read that — try again") and discard silently. No retry flow needed, no interruption — the user just gestures again if they care to.

### Continuation detection (automatic, no user interaction)

Runs automatically after each new passage is saved, comparing it to the immediately-preceding passage in storage.

**Cheap heuristic pre-filter** (no API call, pure logic):
- Was the previous passage's `selectionBounds.yMax` near the bottom of its captured frame (e.g. > 0.85)?
- Is the new passage's `selectionBounds.yMin` near the top of its frame (e.g. < 0.15)?
- Does the previous passage's `refinedText` end without terminal punctuation (no `.`, `!`, `?`, or ends with a hyphenated word suggesting a line break mid-word)?

If at least two of these three conditions hold, treat as a **candidate continuation** and proceed to the Claude check. Otherwise, do nothing further — leave both passages as-is.

**Claude merge check** (only called when the heuristic flags a candidate):
- Send both passages' `refinedText` (and `rawText` if helpful) to Claude with a prompt asking: is the second a direct continuation of the first (e.g. across a page break)? If yes, return a single merged, coherent passage. If no, say so.
- If merged: replace the two individual passage entries with one merged entry (`isMerged: true`, `mergedFromIds: [id1, id2]`), keep the earlier `capturedAt`, keep both original `imageThumb`s if easy (e.g. as an array) or just the first
- If not a continuation: leave both as separate passages, no visible change to the user either way

This should be invisible when it works and harmless when it doesn't — per the product intent, an occasional wrongly-unmerged pair of passages is a fine failure mode; nothing should ever block or prompt the user about this.

---

## Claude API: `lib/claude.js`

### `extractPassage(imageBase64)`

Single cropped image in, structured passage out. No sequence/stitching logic needed in v3 — the crop already isolates the right region from one sharp static frame.

```javascript
const systemPrompt = `You are a reading annotation assistant. The user has captured a cropped region of a page, indicating a passage of text they want to save by dragging their finger down the screen over that region on their phone (the phone's camera itself is held still; the drag was on the touchscreen, not physically over the page).

The image may include a bit more or less than the exact intended passage, since the selection has a buffer margin built in. Your job:
1. Read the text visible in the image
2. Use semantic reasoning to identify the coherent unit of meaning most likely intended — trim obvious unrelated fragments at the very top/bottom edges if they're clearly incomplete or unrelated, but when in doubt include rather than exclude
3. Identify the likely source type (book, printout, screen, presentation slide, etc.)

Respond ONLY with JSON, no markdown fences:
{
  "rawText": "full extracted text including buffer",
  "refinedText": "the semantically coherent target passage",
  "context": "brief source description",
  "confidence": "high | medium | low"
}

If unreadable or no clear text is found:
{ "error": "brief explanation" }`;
```

Resize the cropped image to a reasonable max dimension (e.g. 1024px longest edge) before encoding, to keep payloads light.

### `checkContinuation(previousPassage, newPassage)`

```javascript
const systemPrompt = `You are checking whether two consecutively-captured reading passages are actually one continuous passage split across a page or column break.

Passage 1 (captured first): "${previousPassage.refinedText}"
Passage 2 (captured second): "${newPassage.refinedText}"

If Passage 2 is a direct textual continuation of Passage 1 (e.g. a sentence or paragraph that continues across a page break), respond with:
{ "isContinuation": true, "mergedText": "the two passages combined into one coherent, correctly-joined passage" }

If they are not a continuation of each other (unrelated or separate passages), respond with:
{ "isContinuation": false }

Respond ONLY with JSON, no markdown fences.`;
```

### `chatWithPassages(messages, passagesArray)`

Unchanged from v2 — inject all stored passages (merged ones represented as a single entry) into the system prompt, stream response, cite `refinedText`.

### `transcribeAudio(audioBase64)` — optional, best-effort, same as v2.

---

## Storage: `lib/storage.js`

Same core helpers as v2 (`getPassages`, `savePassage`, `deletePassage`), plus:

```javascript
export const replacePassages = (idsToRemove, newPassage) => {
  const passages = getPassages().filter(p => !idsToRemove.includes(p.id));
  passages.unshift(newPassage);
  localStorage.setItem(DB_KEY, JSON.stringify(passages));
};
```
Used by the continuation-merge logic to atomically swap two entries for one merged entry.

---

## Audio Recording

Same mechanism as v2 (MediaRecorder, base64, `<audio>` playback). Since there's no longer a confirm step, the persistent record button simply attaches its result to **whichever passage was most recently saved** at the time recording stops. If no passage exists yet, disable the button or show a brief "capture something first" toast on tap.

---

## Design

Same palette/tone as v2 (`#0F0F0F` background, `#E8D5B0` accent, warm parchment, minimal, dark-first, tool-like).

**Selection band**: semi-transparent accent color (`#E8D5B0` at ~25% opacity), full width, smooth top/bottom edges following the live drag — no need for anything more elaborate than a simple animated div.

**Toast**: small, bottom-of-screen, dark surface with light text, "Captured" + underlined "Undo" text button, fades out after ~4s or on manual dismiss tap.

**Haptics**: short tick (~10ms) on touch-start and touch-end. Nothing else needs vibration in this version.

Mobile only, ~390px width design target.

---

## Error Handling

- Camera permission denied → clear message + settings link
- Wide-angle constraint unsupported → silent fallback to standard lens
- Extraction returns `{ error }` or API call fails → brief toast, discard, no retry flow, no interruption
- Accidental tap (no meaningful drag) → ignored, no capture attempt at all
- Continuation-check API call fails → fail silently, leave both passages separate (safe default)
- localStorage quota exceeded → warn, offer to delete old passages
- Empty Library / Chat → friendly empty states

---

## Implementation Order (see BUILD_PHASES.md for the checkpointed version of this)

1. Scaffold + storage
2. Claude API layer (`extractPassage`, `checkContinuation`, `chatWithPassages`) — test against single static test images, no sequences needed
3. Capture view: camera + touch tracking + selection band overlay (mock extraction first)
4. Wire real extraction + instant save + undo toast
5. Continuation detection (heuristic + Claude check)
6. Voice notes
7. Library view
8. Chat view
9. Polish pass

---

## Acceptance Criteria

- [ ] Camera opens, static/live, no pen-icon overlay
- [ ] Dragging thumb down the screen shows a live translucent band tracking the drag
- [ ] Releasing thumb instantly clears the band and returns to ready state — no loading screen blocks the UI
- [ ] A cropped, correctly-bounded region is sent to Claude and produces a sensible `refinedText`
- [ ] Passage is saved automatically with no confirm step; toast + Undo appears and works
- [ ] User can gesture again immediately while a previous extraction is still processing
- [ ] Continuation detection correctly merges at least an obvious bottom-of-page/top-of-next-page test case, and correctly leaves unrelated passages separate
- [ ] Full `touchPath` is stored on every passage, even though only bounding box is used for cropping in v1
- [ ] Voice note attaches to the most recent passage correctly
- [ ] Library and Chat function as in v2
- [ ] Works in mobile Safari and Chrome on iOS/Android

---

## Explicitly Deferred (not v1, but data/architecture should not block it later)

- **Arbitrary shape/region gestures**: v1 only derives a vertical bounding box from the touch path, but the full path is stored so a future version can support circles, boxes drawn around figures/diagrams, or other non-linear selections by changing only the crop-interpretation logic, not the capture layer.
- **Passages spanning more than one drag on the same page** (very long passages that don't fit one comfortable drag) — not handled; treat as a known limitation.
- **True pen-hardware motion capture** (fast shutter/stabilization enabling actual camera-drag reading) — a hardware R&D question for a future physical device, not part of this software prototype.

---

## Environment

```
VITE_ANTHROPIC_API_KEY=your_key_here
```
`npm run dev -- --host` to test on phone over local network.
