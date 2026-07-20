# Boswell

*verba volant, scripta manent*

Boswell is a mobile-first web app for capturing passages, ideas, and thoughts as you read a physical book. Point your phone's camera at the page and drag your finger over the text you want to keep — it's read, saved, and organized automatically. No typing it out, no losing the page.

Live at [boswell-scribe.vercel.app](https://boswell-scribe.vercel.app).

## What it does

- **Drag-to-capture.** A live camera view with touch-drag text selection — drag down to select, drag back up to retrace and shrink the selection before releasing.
- **Automatic OCR + cleanup.** Each capture is sent once to Claude's vision API to read the text out of the photo and lightly clean it up; the photo itself is never stored, only the resulting text.
- **Title & page tracking.** Triple-tap to log a book's title/author from the camera view; page numbers are detected automatically and can be nudged by hand.
- **Continuation merging.** If a passage is cut off by a page turn, capturing the next page's continuation automatically detects and merges it into one clean passage — invisibly, no user action needed.
- **Capture stacking.** A run of captures made in one sitting groups into a collapsible stack in the library, with a manual "stack with…" option for tying together captures made at different times.
- **Voice notes.** Attach a quick spoken thought to any capture, transcribed live via the browser's own speech recognition — audio is never recorded or stored, only text.
- **Library.** Search, filter by favorite, and browse recent or grouped by title, with swipe gestures for delete (with undo) and favoriting.
- **Chat over your library.** Ask questions across everything you've captured; answers cite the specific passage they're drawn from and jump you straight to it.
- **Real accounts.** Magic-link email sign-in, each user's passages walled off from every other user's via database-level row security — built so it's actually safe to hand the link to a friend.
- **In-app feedback.** A two-finger press-and-hold anywhere opens a quick feedback form (text or voice) that posts straight to a private channel.

## Stack

- **Frontend:** React + Vite, Tailwind CSS
- **Backend:** Supabase (Postgres + Auth + Row Level Security) for accounts and storage
- **AI:** Anthropic's Claude API (vision, for reading text out of photos; text, for continuation-merge detection and the chat/citation feature)
- **Speech:** the browser's native Web Speech API — no third-party transcription service, no audio ever leaves the device
- **Hosting:** Vercel, with two small serverless functions proxying the Claude and Slack-webhook calls so their API keys never reach the client
- **Deploy:** Vercel CLI, `.vercel.app` domain

## Development

Every line of this project was built through an extended pairing session with [Claude Code](https://claude.com/claude-code), Anthropic's agentic coding CLI — architecture, gesture design, backend migration, and dozens of rounds of real-device bug fixes, all driven conversationally rather than hand-written. `PROGRESS.md` is the (very literal) build log: what got built each session, what broke on a real phone and why, and how it got fixed — kept as a genuine record of the process rather than cleaned up after the fact.

## Running locally

```bash
cd reading-tool
npm install
cp .env.example .env   # fill in your own Anthropic + Supabase keys
npm run dev
```

Camera access requires HTTPS on a real device; `npm run dev` serves a self-signed cert for LAN testing (`npm run dev:preview` skips it for local-only work). See `supabase_schema.sql` for the database schema and Row Level Security policies.

## License

MIT — see [LICENSE](../LICENSE).
