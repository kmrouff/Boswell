// Same-origin proxy (api/claude.js) — holds the real API key server-side,
// both in the deployed Vercel function and in local dev via the Vite
// middleware in vite.config.js. The client never sees the key.
const API_URL = '/api/claude';
// Reading text off a page is transcription, not reasoning, so it runs on the
// smallest capable model — cheaper and faster on the app's hottest path.
//
// It is also the only one that reliably works. Anthropic applies output-side
// content filtering, and transcribing real literature trips it far more often
// than you would expect, not only for explicit language. Measured against
// four photographed pages of Stanisław Lem: three were blocked outright on
// Sonnet, the same three were blocked on Opus, and Haiku transcribed all
// three cleanly with correct page numbers. Sensitivity clearly differs by
// model, and it is the passage's own text being reproduced that triggers it —
// a leaner prompt made no difference, so it cannot be prompted around. For a
// reading app this was not an edge case: it meant every capture from an
// entire novel failed.
const VISION_MODEL = 'claude-haiku-4-5-20251001';

// Chat answers questions across the whole library, which is genuine
// reasoning rather than transcription, so it keeps the larger model.
const CHAT_MODEL = 'claude-sonnet-4-6';

// If the small model is ever the one blocked, try the larger one once before
// giving up — the failure is model-specific in both directions.
const FALLBACK_MODEL = CHAT_MODEL;

const isContentFilterBlock = (status, bodyText) =>
  status === 400 && /content filtering/i.test(bodyText);

const EXTRACT_SYSTEM_PROMPT = `Transcribe the passage in this photo of a page. The crop has a small buffer margin, so it may include a partial line at the top or bottom.

Respond ONLY with JSON, no markdown fences:
{
  "rawText": "everything you can read, including the buffer",
  "refinedText": "just the coherent passage — drop incomplete fragments at the edges, but when in doubt keep them",
  "context": "brief source description, with title/author if legible",
  "pageNumber": "the page number as a string, only if actually visible, else null",
  "confidence": "high | medium | low"
}

If unreadable:
{ "error": "brief explanation" }`;

const parseJsonResponse = (text) => {
  const cleaned = text.trim().replace(/^```(json)?/i, '').replace(/```$/, '').trim();
  return JSON.parse(cleaned);
};

const postToProxy = (body) =>
  fetch(API_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

const callClaude = async (body) => {
  let res = await postToProxy(body);
  if (res.ok) return res.json();

  let errText = await res.text();

  // See FALLBACK_MODEL: a content-filter block is about which model is
  // transcribing, not about the image being unreadable, so it's worth one
  // automatic retry before giving up on the capture entirely.
  if (isContentFilterBlock(res.status, errText) && body.model !== FALLBACK_MODEL) {
    res = await postToProxy({ ...body, model: FALLBACK_MODEL });
    if (res.ok) return res.json();
    errText = await res.text();
  }

  // Flagged so the UI can say something truer than "try again" — retrying a
  // filtered passage verbatim fails identically every time.
  if (isContentFilterBlock(res.status, errText)) {
    const err = new Error('Blocked by the content filter');
    err.contentFiltered = true;
    throw err;
  }

  throw new Error(`Claude API error ${res.status}: ${errText}`);
};

// Resizes/re-encodes a base64 image (with data URL prefix or not) so the
// longest edge is at most maxDim, keeping API payloads light.
export const resizeImage = (imageBase64, maxDim = 1024) =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      const width = Math.round(img.width * scale);
      const height = Math.round(img.height * scale);
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = reject;
    img.src = imageBase64.startsWith('data:') ? imageBase64 : `data:image/jpeg;base64,${imageBase64}`;
  });

const toMediaAndData = (dataUrl) => {
  const match = dataUrl.match(/^data:(image\/\w+);base64,(.*)$/s);
  if (!match) return { mediaType: 'image/jpeg', data: dataUrl };
  return { mediaType: match[1], data: match[2] };
};

// Single cropped image in, structured passage out.
export const extractPassage = async (imageBase64) => {
  try {
    const resized = await resizeImage(imageBase64);
    const { mediaType, data } = toMediaAndData(resized);

    const response = await callClaude({
      model: VISION_MODEL,
      max_tokens: 1024,
      system: EXTRACT_SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data } },
            { type: 'text', text: 'Extract the passage from this image.' },
          ],
        },
      ],
    });

    const text = response.content?.[0]?.text ?? '';
    try {
      return parseJsonResponse(text);
    } catch {
      return { error: `Failed to parse Claude response: ${text.slice(0, 200)}` };
    }
  } catch (err) {
    // Covers network failures and API-level blocks. Content-filter blocks are
    // flagged separately (see callClaude) because they are not "couldn't read
    // that" — the image was read fine, the transcription was refused — and
    // the advice for them is different.
    return { error: err.message || 'Extraction failed', contentFiltered: !!err.contentFiltered };
  }
};

const TITLE_SYSTEM_PROMPT = `You are looking at a photo of a book/document title page or cover. Identify the title, and separately the author if visible.

Respond ONLY with JSON, no markdown fences:
{ "title": "the title only, as a short phrase", "author": "the author's name, or null if not visible" }

If no clear title is visible:
{ "error": "brief explanation" }`;

// Lightweight, purpose-built title lookup — deliberately much smaller than
// extractPassage's prompt/response (no rawText/refinedText/pageNumber/
// confidence, smaller image, lower max_tokens) so the "log title" gesture
// resolves noticeably faster than a full passage extraction would.
export const extractTitle = async (imageBase64) => {
  try {
    const resized = await resizeImage(imageBase64, 768);
    const { mediaType, data } = toMediaAndData(resized);

    const response = await callClaude({
      model: VISION_MODEL,
      max_tokens: 150,
      system: TITLE_SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data } },
            { type: 'text', text: 'What is the title?' },
          ],
        },
      ],
    });

    const text = response.content?.[0]?.text ?? '';
    try {
      return parseJsonResponse(text);
    } catch {
      return { error: `Failed to parse Claude response: ${text.slice(0, 200)}` };
    }
  } catch (err) {
    return { error: err.message || 'Title extraction failed' };
  }
};

const PAGE_SYSTEM_PROMPT = `You are looking at a photo of a page from a book or document. Find the page number, which is usually a bare number printed at the very top or very bottom of the page.

Respond ONLY with JSON, no markdown fences:
{ "pageNumber": "the visible page number as a string" }

If no page number is clearly visible, respond with:
{ "pageNumber": null }`;

// Lightweight page-number lookup for the live "what page am I on" indicator —
// small image, tiny response — so it can run without noticeable cost.
export const extractPageNumber = async (imageBase64) => {
  try {
    const resized = await resizeImage(imageBase64, 768);
    const { mediaType, data } = toMediaAndData(resized);

    const response = await callClaude({
      model: VISION_MODEL,
      max_tokens: 50,
      system: PAGE_SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data } },
            { type: 'text', text: 'What page number is visible?' },
          ],
        },
      ],
    });

    const text = response.content?.[0]?.text ?? '';
    try {
      const parsed = parseJsonResponse(text);
      return { pageNumber: parsed.pageNumber ?? null };
    } catch {
      return { pageNumber: null };
    }
  } catch {
    return { pageNumber: null };
  }
};

// Checks whether newPassage is a direct textual continuation of previousPassage
// (e.g. across a page break) and, if so, returns a merged passage.
export const checkContinuation = async (previousPassage, newPassage) => {
  const systemPrompt = `You are checking whether two consecutively-captured reading passages are actually one continuous passage split across a page or column break.

Passage 1 (captured first): "${previousPassage.refinedText}"
Passage 2 (captured second): "${newPassage.refinedText}"

If Passage 2 is a direct textual continuation of Passage 1 (e.g. a sentence or paragraph that continues across a page break), respond with:
{ "isContinuation": true, "mergedText": "the two passages combined into one coherent, correctly-joined passage" }

If they are not a continuation of each other (unrelated or separate passages), respond with:
{ "isContinuation": false }

Respond ONLY with JSON, no markdown fences.`;

  const response = await callClaude({
    model: VISION_MODEL,
    max_tokens: 1024,
    system: systemPrompt,
    messages: [{ role: 'user', content: 'Check continuation.' }],
  });

  const text = response.content?.[0]?.text ?? '';
  try {
    return parseJsonResponse(text);
  } catch {
    return { isContinuation: false };
  }
};

// Machine-readable citation marker the model appends when one passage is
// clearly its primary source. Stripped from everything the user sees (even
// mid-stream, character by character, as it's being typed) and parsed only
// after the stream completes to resolve which passage to jump to.
const CITE_TOKEN = 'CITE_PASSAGE:';
const CITE_TRAILING_RE = new RegExp(`\\n+${CITE_TOKEN}\\s*(\\d+)\\s*$`, 'i');

// Removes a trailing citation marker — complete ("\nCITE_PASSAGE: 3") or
// still being typed out token-by-token ("\nCITE_P", "\nCITE_PASSAGE:", ...)
// — from the tail of `text`, so it's never visible to the user.
const stripCitationForDisplay = (text) => {
  const nlIdx = text.lastIndexOf('\n');
  if (nlIdx === -1) return text;
  const tail = text.slice(nlIdx).replace(/^\n+/, '');
  const isPartialOrFullMarker = CITE_TOKEN.startsWith(tail) || new RegExp(`^${CITE_TOKEN}\\s*\\d*$`, 'i').test(tail);
  return isPartialOrFullMarker ? text.slice(0, nlIdx).replace(/\s+$/, '') : text;
};

// Streams a chat response with all saved passages injected as context.
// onToken is called with each incremental (display-safe, marker-stripped)
// full text as it streams in. Resolves to { text, citation }, where
// citation is { id, label } for the passage the model cited, or null.
export const chatWithPassages = async (messages, passagesArray, onToken) => {
  const passagesContext = passagesArray
    .map((p, i) => {
      const source =
        [p.sourceTitle, p.pageNumber ? `p. ${p.pageNumber}` : null].filter(Boolean).join(', ') ||
        p.context ||
        'unknown source';
      const note = p.audioTranscript ? `\n(voice note: ${p.audioTranscript})` : '';
      return `[Passage ${i + 1}] (${source}):\n${p.refinedText}${note}`;
    })
    .join('\n\n');

  const systemPrompt = `You are a reading assistant helping the user reflect on and discuss passages they've captured while reading. Here are all the passages they've saved so far:

${passagesContext || '(no passages saved yet)'}

Answer the user's questions using these passages as context. When relevant, quote or reference the specific passage(s) you're drawing from (by their title/page when available). Some passages may have a voice note the user recorded — treat it as their own annotation on that passage.

If your answer draws primarily from one specific passage, end your response — after a blank line — with exactly:
${CITE_TOKEN} <passage number>
Only include this when a single passage is clearly the primary source; omit it entirely if you're synthesizing across several passages equally, or didn't cite anything specific.`;

  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model: CHAT_MODEL,
      max_tokens: 2048,
      system: systemPrompt,
      messages,
      stream: true,
    }),
  });

  if (!res.ok || !res.body) {
    const errText = res.body ? await res.text() : 'No response body';
    throw new Error(`Claude API error ${res.status}: ${errText}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let fullText = '';
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split('\n');
    buffer = lines.pop();

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const payload = line.slice(6);
      if (payload === '[DONE]') continue;
      try {
        const event = JSON.parse(payload);
        if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
          fullText += event.delta.text;
          onToken?.(event.delta.text, stripCitationForDisplay(fullText));
        }
      } catch {
        // ignore malformed SSE lines
      }
    }
  }

  let citation = null;
  const match = CITE_TRAILING_RE.exec(fullText);
  if (match) {
    const cited = passagesArray[Number(match[1]) - 1];
    if (cited) {
      const label =
        [cited.sourceTitle, cited.pageNumber ? `p. ${cited.pageNumber}` : null].filter(Boolean).join(' · ') ||
        cited.context ||
        'Source';
      citation = { id: cited.id, label };
    }
  }

  return { text: stripCitationForDisplay(fullText), citation };
};

// Best-effort audio transcription for voice notes.
export const transcribeAudio = async (audioBase64, mimeType = 'audio/webm') => {
  try {
    const response = await callClaude({
      model: VISION_MODEL,
      max_tokens: 512,
      system:
        'Transcribe the audio note as plain text. Respond ONLY with the transcript text, no preamble, no JSON.',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Transcribe this voice note:' },
            {
              type: 'document',
              source: { type: 'base64', media_type: mimeType, data: audioBase64 },
            },
          ],
        },
      ],
    });
    return response.content?.[0]?.text?.trim() ?? null;
  } catch {
    return null;
  }
};
