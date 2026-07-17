// Proxies requests to the Anthropic API, adding the real API key server-side
// so it never ships in the client bundle. The client (lib/claude.js) sends
// exactly the same body it used to send directly to api.anthropic.com/v1/messages
// (model/system/messages/max_tokens/stream) — this just forwards it with auth
// attached, streaming the response straight through when `stream: true`.
//
// Written as a plain Node req/res handler (not Vercel-specific types) so the
// exact same function also runs under Vite's dev server middleware — see
// vite.config.js — meaning local dev over the LAN (phone testing) proxies
// through here too, not just the deployed version.
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';

const readJsonBody = (req) =>
  new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => (raw += chunk));
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.writeHead(405, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    res.writeHead(500, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'Server is missing ANTHROPIC_API_KEY' }));
    return;
  }

  let body;
  try {
    // Vercel's Node runtime pre-parses JSON bodies onto req.body; Vite's raw
    // dev-server middleware doesn't, so fall back to reading the stream.
    body = req.body && typeof req.body === 'object' ? req.body : await readJsonBody(req);
  } catch {
    res.writeHead(400, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'Invalid JSON body' }));
    return;
  }

  let upstream;
  try {
    upstream = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    res.writeHead(502, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: `Could not reach Anthropic: ${err.message}` }));
    return;
  }

  if (body.stream) {
    res.writeHead(upstream.status, {
      'content-type': upstream.headers.get('content-type') || 'text/event-stream',
      'cache-control': 'no-cache',
    });
    if (upstream.body) {
      for await (const chunk of upstream.body) res.write(chunk);
    }
    res.end();
    return;
  }

  const text = await upstream.text();
  res.writeHead(upstream.status, { 'content-type': 'application/json' });
  res.end(text);
}
