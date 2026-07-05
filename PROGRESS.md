# Progress

- [x] Phase 0 — Scaffold + Storage
- [x] Phase 1 — Claude API layer (single-image + continuation check)
- [ ] Phase 2 — Capture view (camera + touch-drag selection)
- [ ] Phase 3 — Wire capture to Claude + instant save + undo
- [ ] Phase 4 — Continuation detection
- [ ] Phase 5 — Voice notes
- [ ] Phase 6 — Library view
- [ ] Phase 7 — Chat view
- [ ] Phase 8 — Polish pass

## Notes
(Claude Code: add a short note here after each phase — what was built, any deviations from spec, anything the user should know before the next session)

**Phase 0 (2026-07-05):** Scaffolded `reading-tool/` with Vite + React (JS, no TS). Tailwind loaded via CDN `<script>` in `index.html` (per spec — not a PostCSS build step), with `ink`/`parchment` colors configured to match the palette. Three-view tab shell in `App.jsx` (Capture/Library/Chat), each view currently a placeholder component. `lib/storage.js` fully implemented (`getPassages`, `savePassage`, `deletePassage`, `getPassage`, `updatePassage`, `replacePassages`, `clearAllPassages`) and manually verified in the browser console against a dummy passage object matching the v3 data model — save/get/update/replace(merge)/delete all confirmed working via `localStorage`. `uuid` installed as a dependency for Phase 2+. Git repo initialized at the project root (`/Users/kevinrouff/Claude/Projects/AI Pen`) since none existed yet — this first commit covers everything, including the two spec docs. `.env.example` added; real `.env` is gitignored. No API calls made yet — that's Phase 1, and will need the 2-3 test images described in the spec dropped into `test-assets/` (currently empty).

**Phase 1 (2026-07-05):** Implemented `lib/claude.js` — `extractPassage`, `checkContinuation`, `chatWithPassages` (streaming via SSE), and a best-effort `transcribeAudio`. Verified all three core functions against the real Claude API (`claude-sonnet-4-6`) using photos of a Stanisław Lem short story collection dropped into `test-assets/`: `extractPassage` returned well-formed JSON with sensible `rawText`/`refinedText`/`context`/`confidence` from a real cropped page photo; `checkContinuation` correctly merged a sentence manually split across two fake passage objects and correctly left an unrelated pair separate; `chatWithPassages` streamed a response that correctly referenced the injected passage content.

**Important finding — content filtering on literary text:** Anthropic's API applies output-side content filtering, and it's easy to trip with real literature: an explicit-language passage (Bukowski's *Factotum*) was blocked outright, but so was a comparatively tame Lem passage (*"The Mask"*, no explicit content, just unsettling body-horror themes) — so this isn't only a slurs/profanity issue, it can trigger on dark subject matter more broadly. Since the user flagged this is expected with real reading material, `extractPassage` now wraps its entire body in a try/catch so any API-level block (or network failure) resolves to `{ error: "..." }` instead of throwing — this was a real gap in the original implementation, not just a test-data problem. This matches the spec's existing error-handling contract (Capture view already discards `{ error }` results with a brief toast, no crash, no retry). No further mitigation is implemented — prompt-level framing is unlikely to reliably bypass a hard output classifier, so "occasionally can't capture a passage" is being treated as an accepted, gracefully-handled limitation rather than something engineered around. Worth revisiting only if it turns out to trigger often enough in practice to be annoying — could try `checkContinuation`-style paraphrasing instead of verbatim extraction as a future mitigation if needed.
