// Posts a feedback message (text, or a voice note transcribed to text — no
// audio ever leaves the device, same rule as the rest of the app) to a
// Slack channel via an Incoming Webhook. Same plain-Node-handler pattern as
// api/claude.js, so it runs both as the deployed Vercel function and, via
// vite.config.js, the local dev proxy.
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

  const webhookUrl = process.env.SLACK_FEEDBACK_WEBHOOK_URL;
  if (!webhookUrl) {
    res.writeHead(500, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'Server is missing SLACK_FEEDBACK_WEBHOOK_URL' }));
    return;
  }

  let body;
  try {
    body = req.body && typeof req.body === 'object' ? req.body : await readJsonBody(req);
  } catch {
    res.writeHead(400, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'Invalid JSON body' }));
    return;
  }

  const message = (body.message || '').trim();
  if (!message) {
    res.writeHead(400, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'Empty message' }));
    return;
  }

  const view = body.view || 'unknown';
  const when = new Date().toLocaleString('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  const slackPayload = {
    blocks: [
      { type: 'section', text: { type: 'mrkdwn', text: `*New feedback* — from _${view}_` } },
      { type: 'section', text: { type: 'mrkdwn', text: message } },
      { type: 'context', elements: [{ type: 'mrkdwn', text: when }] },
    ],
  };

  let upstream;
  try {
    upstream = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(slackPayload),
    });
  } catch (err) {
    res.writeHead(502, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: `Could not reach Slack: ${err.message}` }));
    return;
  }

  if (!upstream.ok) {
    const text = await upstream.text();
    res.writeHead(502, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: `Slack rejected the message: ${text}` }));
    return;
  }

  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ ok: true }));
}
