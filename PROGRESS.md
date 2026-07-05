# Progress

- [x] Phase 0 — Scaffold + Storage
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

**Phase 0 (2026-07-05):** Scaffolded `reading-tool/` with Vite + React (JS, no TS). Tailwind loaded via CDN `<script>` in `index.html` (per spec — not a PostCSS build step), with `ink`/`parchment` colors configured to match the palette. Three-view tab shell in `App.jsx` (Capture/Library/Chat), each view currently a placeholder component. `lib/storage.js` fully implemented (`getPassages`, `savePassage`, `deletePassage`, `getPassage`, `updatePassage`, `replacePassages`, `clearAllPassages`) and manually verified in the browser console against a dummy passage object matching the v3 data model — save/get/update/replace(merge)/delete all confirmed working via `localStorage`. `uuid` installed as a dependency for Phase 2+. Git repo initialized at the project root (`/Users/kevinrouff/Claude/Projects/AI Pen`) since none existed yet — this first commit covers everything, including the two spec docs. `.env.example` added; real `.env` is gitignored. No API calls made yet — that's Phase 1, and will need the 2-3 test images described in the spec dropped into `test-assets/` (currently empty).
