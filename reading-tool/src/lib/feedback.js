// Sends a feedback message to the /api/feedback proxy, which forwards it to
// Slack. Text only — voice notes are transcribed client-side first (same
// "convert to text, discard audio" rule as everywhere else in the app).
export const sendFeedback = async ({ message, view }) => {
  const res = await fetch('/api/feedback', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ message, view }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Feedback failed: ${text || res.status}`);
  }
};
