# Handoff: Reading Tool — Library/Capture/Chat UI Pass

## Overview
A UI/UX refresh for the **Reading Tool** app (mobile-first, React + Vite; repo `kmrouff/reading_tool`, app lives in `reading-tool/`). This pass covers a warmer/bookish visual system, a redesigned Library (collapsible title groups, swipe-to-reveal card actions, favorites, search), a Settings drawer with in-app theme switching, and small Capture/Chat fixes.

It is **not** a redesign of the interaction model — triple-tap title capture, no-image-storage, invisible continuation merging, transcription-only audio, and the other decisions logged in `PROGRESS.md` are all preserved. Do not undo them.

## About the Design Files
`Reading Tool.dc.html` in this bundle is a **design reference** — a single self-contained HTML/JS prototype showing the intended look and behavior. It is **not** production code and must not be dropped into the repo. The task is to **recreate these designs in the existing React/Vite codebase**, using its established components and patterns (Tailwind via CDN with the `ink`/`parchment` config, the existing `lib/storage.js`, `lib/claude.js`, `lib/dictation.js`, the `passage-saved` window event, etc.).

The prototype uses seeded fake data and stubbed camera/chat; ignore those — wire the real ones already present in the repo.

## Fidelity
**High-fidelity.** Colors, typography, spacing, radii, and interactions are final. Recreate pixel-closely, but express everything through the existing Tailwind setup / component structure rather than copying inline styles verbatim.

Note the prototype expresses theming with CSS custom properties (`--bg`, `--surface`, `--fg`, `--acc`, etc.) so one palette swap re-skins everything. In the repo this maps cleanly onto Tailwind theme tokens or CSS variables on a root wrapper — see **Theming** below.

---

## Design Tokens

### Type
- Display / wordmark / section titles: **Instrument Serif** (Google Fonts).
- Reading/passage text, group titles, chat bubbles, empty-state lines: **Newsreader** (Google Fonts).
- UI chrome (labels, meta, nav, buttons, inputs): **Hanken Grotesk** (Google Fonts), weights 400/500/600/700.
- Load all three via one Google Fonts `<link>`.

### Themes (palettes)
Each theme is a set of tokens. `fg`/`acc`/`fill`/`onFill`/`onAcc` are **space-separated RGB channels** (used as `rgb(<ch> / <alpha>)` for translucent overlays); `bg`/`surface`/`raised`/`canvas` are hex.

| token | Ink & Gold | Warm Paper (default) | Sage Study | Faded Linen |
|---|---|---|---|---|
| bg (app background) | `#100F0D` | `#ECE3D1` | `#161A15` | `#E9E3D6` |
| surface (card bg) | `#16140F` | `#F7F1E3` | `#1D221B` | `#F3EEE2` |
| raised (toast/snackbar) | `#1A1814` | `#F7F1E3` | `#22271F` | `#F3EEE2` |
| canvas (behind phone; N/A in app) | `#DED6C6` | `#C7BBA0` | `#C6C9B7` | `#BFB7A6` |
| fg (text) | `232 213 176` | `58 50 38` | `221 226 209` | `70 62 54` |
| acc (accent) | `232 177 76` | `150 96 58` | `138 158 106` | `124 106 140` |
| fill (user chat bubble / paper fill) | `232 213 176` | `58 50 38` | `221 226 209` | `70 62 54` |
| onFill (text on fill) | `16 15 13` | `247 241 227` | `22 26 21` | `243 238 226` |
| onAcc (text on accent) | `16 15 13` | `247 241 227` | `22 26 21` | `243 238 226` |

Default theme is **Warm Paper**. An **accent override** (curated swatches: `#96603A`, `#8A9E6A`, `#7C6A8C`, `#B0785A`, `#4E6E5D`, `#E8B14C`) can replace `acc`; when overridden, compute `onAcc` from luminance (`0.299r+0.587g+0.114b > 150` → dark text `20 18 14`, else light `247 243 233`).

### Radius
Card/group corner radius is a single tunable token (`--radius`), default **16px** (range 6–26). Applies to cards, group headers, the swipe wrapper.

### Fixed action colors (not themed)
- Delete tray bg `#7a2d26`, icon `#f0d9d4`.
- Priority/heart tray bg `#E3B75E` (off) / `#C98A2B` (on), icon `#3a2e12`.
- Favorite-on heart (search bar): `#D6584B` (warm red).
- Record dot (Capture): `#E86A5C`.

---

## Screens / Views

### 1. Global shell (`App.jsx`)
- Full-height flex column; `<main>` scrolls, bottom tab bar fixed.
- **Bottom nav**: three tabs Capture / Library / Chat. Icon + label stacked, `Hanken Grotesk` 11px/600. Active = accent color `rgb(var(--acc))`; inactive = `rgb(var(--fg) / .4)`. Icons are minimal line SVGs (camera = rounded rect + lens circle + top nub; library = 3 stacked rounded bars; chat = rounded-rect bubble with a small tail). Top border `1px rgb(var(--fg) / .1)`, bg `var(--bg)`.
- App background follows `var(--bg)`; default text `rgb(var(--fg))`.

### 2. Capture (`CaptureView.jsx`) — minor changes only
Keep all existing gesture logic. Two fixes:
- **Toast collision fix (P0):** the "Captured" undo toast must NOT sit on the page indicator. Move the toast up (prototype uses `bottom: 100px`, centered, above the record row), and keep the page indicator at the bottom-left (`bottom: 24px; left: 20px`). Record button bottom-right (`bottom: 22px; right: 20px`, 60px circle).
- **Copy:** title indicator empty state reads **"＋ Tap to add title"** (was "No title ascribed").
- Capture chrome intentionally stays light-on-dark (camera UI convention) regardless of theme — do NOT theme the title pill / page indicator / capture toast text; keep them parchment on black scrims.

### 3. Library (`LibraryView.jsx` + `PassageCard.jsx`) — main work

**Header**
- Row: left = "Library" (Instrument Serif ~34px) + subtitle "N passages · M titles" (Newsreader italic 14px, `rgb(var(--fg)/.5)`); right = a **⋮ (three-dot) button** opening the Settings drawer (vertical 3 dots SVG, `rgb(var(--fg)/.6)`, press-scale 0.85).

**Search bar**
- Pill row, bg `rgb(var(--fg)/.06)`, border `1px rgb(var(--fg)/.14)`, radius 14px, height 46px, padding `0 14px`.
- Left `⌕` glyph `rgb(var(--fg)/.4)`; text input flex-1, transparent, `rgb(var(--fg))`, Hanken 14px.
- **Right-inner favorites heart** (replaces the old separate chip): a heart icon button. Off = outline, `rgb(var(--fg)/.4)`; On = **filled red `#D6584B`**. Tapping toggles a "favorites only" filter over the list. Use the SAME heart SVG as the card swipe action (see Icons).

**View toggle** — segmented "Recent" / "By title", 40px tall targets, in a `rgb(var(--fg)/.06)` track, active pill `rgb(var(--fg)/.14)` + `rgb(var(--fg))` text, inactive `rgb(var(--fg)/.5)`.

**List — Recent view:** flat, newest-first, one card per passage.

**List — By-title view (collapsible groups):**
- Group passages by `sourceTitle`; untitled → "Miscellaneous" (always sorts last).
- Each group renders a **collapsible header button**: a chevron (`▸` collapsed / `▾` open), the **title** (Newsreader 17px `rgb(var(--fg))`), the **author** underneath in a fainter style (Hanken 11.5px `rgb(var(--fg)/.45)`), and the passage count on the right (`rgb(var(--fg)/.4)`). Header bg `rgb(var(--fg)/.04)`, border `1px rgb(var(--fg)/.1)`, radius `var(--radius)`, padding `13px 15px`.
- **Groups are collapsed by default** so a large library reads as a list of books, not endless excerpts. Tapping a header toggles that group. Cards render only for expanded groups.
- Author requires a new **`author`** field on passages (see State/Data).

**Passage card (`PassageCard.jsx`)**
- Surface `var(--surface)` (opaque, so swipe tray is hidden beneath), border `1px rgb(var(--fg)/.1)`, radius `var(--radius)`, padding 18px.
- **Excerpt** is the hero: Newsreader **19px**/1.45 `rgb(var(--fg))`, `text-wrap: pretty`, clamped to 2 lines when collapsed (`-webkit-line-clamp:2`), full on tap.
- **Meta line** (Hanken 12px `rgb(var(--fg)/.5)`), 14px above:
  - Recent view: `title · author · p.N` (whichever exist).
  - By-title view: just `p.N` (title/author are in the header).
- **Voice-note annotation** (if `audioTranscript`): a distinct block, top border `1px rgb(var(--fg)/.08)`, label "Voice note" (Hanken 10.5px/600 uppercase, `rgb(var(--acc)/.8)`) + transcript (Newsreader italic 14px `rgb(var(--fg)/.7)`), collapsed to 1 line, expands on tap.
- **Footer row:** date left (Hanken 11.5px `rgb(var(--fg)/.4)`); on the right a single **"＋" button** — NO bounding circle, bold `＋` (Hanken 700, ~22px, `rgb(var(--fg)/.8)`), 44px tap target, press feedback: `transform: scale(0.8)` + color → `rgb(var(--acc))` on `:active`, 0.12s transition. Opens the inline annotate menu (Add title / Add page / Add voice note) exactly as today.
- **Priority marker:** when `priority` is set, a small **filled heart** in the accent color at the card's top-right (`rgb(var(--acc))`, ~15px).
- Merged passages render identically (no badge) — unchanged.

**Swipe-to-reveal actions (replaces the footer trash button):**
- The card slides left on horizontal drag to reveal a right-anchored action tray: **Priority (heart)** then **Delete (trash)**, each a 74px-wide icon-only button (no text labels).
- Heart tray: warm yellow bg (`#E3B75E` default / `#C98A2B` when already priority), icon `#3a2e12`. Delete tray: `#7a2d26` bg, `#f0d9d4` icon.
- **Seamless bleed:** extend the heart (leftmost) tray button's fill leftward under the card so no left edge is ever visible during over-drag (prototype uses `box-shadow: -140px 0 0 0 <trayColor>`).
- Tapping Priority toggles `priority`; Delete removes with the undo snackbar.
- **Auto-close the open swipe** when: the list is scrolled, the Recent/By-title view is switched, or the user navigates to another tab.

**Delete + Undo (P0):** deleting from the Library must be reversible. Show an undo snackbar ("Passage deleted" + a **↺ Undo** button, accent-tinted) for ~5s that restores the passage at its original index. (Capture already has undo; Library previously did not.)

**Empty states:** no passages → existing empty copy; search/favorites with no matches → "Nothing matches that." (Newsreader italic 20px `rgb(var(--fg)/.7)`).

### 4. Settings drawer (new)
- Opened by the Library ⋮ button. Slides in from the right (`transform: translateX(100% → 0)`, 0.3s `cubic-bezier(.22,.61,.36,1)`), width **86%** of the screen, bg `var(--bg)`, padding `54px 20px 24px`, scrolls. **No drop shadow** on the drawer edge (explicitly removed per feedback). A scrim (`rgba(0,0,0,.45)`, fade 0.28s) sits behind and closes the drawer on tap. Covers the screen area, not the bottom nav.
- Header: "Settings" (Instrument Serif 27px) + × close button (press-scale 0.85).
- **Appearance section** (functional): section label (Hanken 11px/600 uppercase `rgb(var(--fg)/.4)`), then the 4 theme rows. Each row = a swatch preview (46×30 rounded rect filled with that theme's `bg`, containing two 8px dots: one `rgb(fg)`, one `rgb(acc)`) + theme name (Hanken 14px) + a ✓ (accent) when active. Active row bg `rgb(var(--acc)/.12)`, others `rgb(var(--fg)/.05)`. Tapping applies the theme app-wide immediately (in-app override; see Theming).
- **Support section** (placeholder, non-functional): "Send feedback" and "Contact us" rows with a `›` chevron, bottom borders `rgb(var(--fg)/.08)`.
- Divider, then **Account section** (placeholder): "Log in" and "Privacy policy" rows, muted (`rgb(var(--fg)/.4)`), each with a "Soon" pill. Leave room here for future auth/privacy items.

### 5. Chat (`ChatView.jsx`) — small changes
- **Remove borders** on the assistant bubbles and the empty-state suggestion chips; differentiate with fill only. Assistant bubble bg `rgb(var(--fg)/.07)`, radius `18px 18px 18px 4px`. Suggestion chips bg `rgb(var(--fg)/.06)`, radius 14px, press feedback (scale 0.985 + bg `rgb(var(--fg)/.1)`). User bubble = `rgb(var(--fill))` bg with `rgb(var(--onFill))` text, radius `18px 18px 4px 18px`.
- **Citation jump (P1):** the assistant's cited source renders as a tappable accent chip ("↗ Title · p.N"); tapping switches to Library and briefly flashes that passage card (`rgb(var(--acc))` inset ring, ~1.6s). Wire this against the real streamed citations.
- **Suggestion that is a template** ("What was that bit about…?") must POPULATE the input (`"What was that bit about "`) rather than sending a literal incomplete query. The other suggestions send normally.
- Send button: `rgb(var(--acc))` bg, `rgb(var(--onAcc))` text.

---

## Interactions & Behavior
- **Swipe:** pointer-based; engage horizontal drag only when |dx|>|dy| after a 6px threshold (so vertical scroll still works); `setPointerCapture` must be wrapped in try/catch (throws on synthetic/edge pointer sequences). Open at drag < −OPEN_W/2 (OPEN_W = 148). Suppress the card's expand tap if a drag occurred.
- **Theme switch** is instant and global.
- **Favorites filter** = `favOnly && !p.priority` excluded; combine with the text search.
- All new tap targets ≥44px. Press-state feedback (`:active` scale) on ⋮, ＋, close, suggestion chips.
- Transitions: swipe `transform .24s cubic-bezier(.22,.61,.36,1)`; drawer `.3s` same easing; scrim opacity `.28s`.

## State Management
New/changed state (map onto React state + `lib/storage.js`):
- Passage model gains **`author`** (string | null). Populate on capture (extraction can attempt author; otherwise editable via the card ＋ menu / title flow). `priority` (bool) already implied — add it, persisted, toggled by the swipe heart.
- Library view: `query`, `grouped` (Recent/By-title), `favOnly`, `expandedGroups` (map title→bool, default collapsed), `swipedId` (open card, reset on scroll/view/tab change), `deleted` (undo buffer {passage, index}), `expandedId` (card excerpt), `menuId` (annotate menu).
- App/theme: `settingsOpen`, `themeOverride` (selected theme name; falls back to default "Warm Paper"), plus optional `accent` and `radius` if you expose them. Persist theme choice (localStorage) so it survives reload.
- Everything continues to refresh on the existing `passage-saved` window event.

## Assets
- Fonts: Instrument Serif, Newsreader, Hanken Grotesk (Google Fonts) — add the `<link>` to `index.html`.
- Icons are inline line SVGs (nav camera/library/chat, trash, heart, chevrons, 3-dot). The **heart** and **trash** must share stroke style (`stroke-width` ~2.2, `stroke-linejoin: round`, ~17–20px); heart path used in the prototype:
  `M12 20 C12 20 3.5 14.5 3.5 8.8 A4.3 4.3 0 0 1 12 6.2 A4.3 4.3 0 0 1 20.5 8.8 C20.5 14.5 12 20 12 20 Z` (fill `currentColor` when active, else `none`).
- No raster assets. Camera feed is the real `getUserMedia` stream (prototype fakes it).

## Files
- `Reading Tool.dc.html` — the full interactive design reference (all screens, themes, and interactions). Open in a browser to inspect exact spacing/behavior; use browser devtools to read computed values.

### Target repo files to change
- `reading-tool/index.html` — add font links; extend Tailwind config with theme tokens if desired.
- `reading-tool/src/App.jsx` — theme provider/root vars, bottom nav restyle, settings routing.
- `reading-tool/src/components/LibraryView.jsx` — search + favorites heart, collapsible By-title groups, undo snackbar, view state.
- `reading-tool/src/components/PassageCard.jsx` — swipe actions, borderless/type-scaled card, ＋ restyle, priority heart, author in meta.
- `reading-tool/src/components/CaptureView.jsx` — toast reposition, title copy.
- `reading-tool/src/components/ChatView.jsx` — borderless bubbles, citation jump, template-suggestion populate.
- **New:** a `SettingsDrawer.jsx` and a small theme module (token maps + current-theme resolver + localStorage persistence).
- `reading-tool/src/lib/storage.js` / data model — add `author` and `priority`; theme persistence helpers.
