# Boswell

<img src="docs/hero.png" width="720">

Boswell is a mobile web app for saving passages out of physical books: point your camera at a page and drag a finger down the text you want to keep.

## Why I built it

I mark up books constantly, underlining and folding corners, then never go back to any of it. Typing a passage out is slow enough that I skip it and lose the line. This makes keeping one cost about as much effort as underlining it.

## How it works

The camera feed stays live. A vertical drag selects a band of the page, and on release the app crops that region from the video frame and sends it to the Claude API to be read. Capture is non-blocking, so you can keep going while the last one processes.

Passages are stored in Supabase (Postgres, magic-link sign-in, row-level security so an account only reads its own rows). Two Vercel functions proxy the Anthropic and Slack calls, keeping those keys server-side. The Supabase anon key is public by design and is protected by those policies.

Transcription runs on Claude Haiku, which is cheaper, faster, and much less likely to be refused by output content filtering (on four test pages, Sonnet and Opus were each blocked on three; Haiku read all four). Chat uses Sonnet. Voice notes use the browser's Web Speech API and are saved as text, so no audio is recorded or uploaded.

The front end is React and Vite with Tailwind from a CDN.

## Status

Deployed and working end to end. Honest gaps:

- No automated tests.
- Voice dictation relies on the browser's speech API and is unreliable on iOS Safari.
- Content filtering can still refuse a passage. The app retries on a second model, then reports it plainly.
- Sharing a book's captures with another user is not built.
- Undo does not reverse an automatic continuation merge.

`docs/` holds the build spec and a session-by-session build log.

## Running it locally

Needs Node 18 or later, a Supabase project, and an Anthropic API key.

```bash
cd reading-tool
npm install
cp .env.example .env   # fill in your own keys
npm run dev
```

Run `supabase_schema.sql` in the Supabase SQL editor first to create the table and policies. Camera access needs HTTPS, so `npm run dev` serves a self-signed certificate for phone testing.

Built with Claude Code.
