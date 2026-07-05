const API_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-sonnet-4-6';
const API_KEY = import.meta.env.VITE_ANTHROPIC_API_KEY;

const EXTRACT_SYSTEM_PROMPT = `You are a reading annotation assistant. The user has captured a cropped region of a page, indicating a passage of text they want to save by dragging their finger down the screen over that region on their phone (the phone's camera itself is held still; the drag was on the touchscreen, not physically over the page).

The image may include a bit more or less than the exact intended passage, since the selection has a buffer margin built in. Your job:
1. Read the text visible in the image
2. Use semantic reasoning to identify the coherent unit of meaning most likely intended — trim obvious unrelated fragments at the very top/bottom edges if they're clearly incomplete or unrelated, but when in doubt include rather than exclude
3. Identify the likely source type (book, printout, screen, presentation slide, etc.), including author/title if legible or inferable
4. If a page number is visible anywhere in the image, report it — otherwise null. Don't guess if it's not actually visible.

Respond ONLY with JSON, no markdown fences:
{
  "rawText": "full extracted text including buffer",
  "refinedText": "the semantically coherent target passage",
  "context": "brief source description",
  "pageNumber": "the visible page number as a string, or null if none is visible",
  "confidence": "high | medium | low"
}

If unreadable or no clear text is found:
{ "error": "brief explanation" }`;

const parseJsonResponse = (text) => {
  const cleaned = text.trim().replace(/^```(json)?/i, '').replace(/```$/, '').trim();
  return JSON.parse(cleaned);
};

const callClaude = async (body) => {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': API_KEY,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Claude API error ${res.status}: ${errText}`);
  }

  return res.json();
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
      model: MODEL,
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
    // Covers network failures and API-level blocks (e.g. output content
    // filtering on passages with explicit language) — both are just
    // "couldn't read that" from the UI's perspective, not a crash.
    return { error: err.message || 'Extraction failed' };
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
    model: MODEL,
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

// Streams a chat response with all saved passages injected as context.
// onToken is called with each incremental text chunk as it streams in.
export const chatWithPassages = async (messages, passagesArray, onToken) => {
  const passagesContext = passagesArray
    .map((p, i) => `[Passage ${i + 1}] (${p.context || 'unknown source'}, captured ${p.capturedAt}):\n${p.refinedText}`)
    .join('\n\n');

  const systemPrompt = `You are a reading assistant helping the user reflect on and discuss passages they've captured while reading. Here are all the passages they've saved so far:

${passagesContext || '(no passages saved yet)'}

Answer the user's questions using these passages as context. When relevant, quote or reference the specific passage(s) you're drawing from.`;

  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': API_KEY,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: MODEL,
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
          onToken?.(event.delta.text, fullText);
        }
      } catch {
        // ignore malformed SSE lines
      }
    }
  }

  return fullText;
};

// Best-effort audio transcription for voice notes.
export const transcribeAudio = async (audioBase64, mimeType = 'audio/webm') => {
  try {
    const response = await callClaude({
      model: MODEL,
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
