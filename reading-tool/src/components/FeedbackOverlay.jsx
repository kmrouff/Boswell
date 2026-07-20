import { useEffect, useRef, useState } from 'react';
import { isDictationSupported, startDictation } from '../lib/dictation.js';
import { sendFeedback } from '../lib/feedback.js';

// Reached via a two-finger press-and-hold anywhere in the app (see App.jsx) —
// deliberately not a labeled button, so it stays out of the way until needed.
// Text or voice (transcribed live, never stored as audio, same rule as
// voice notes elsewhere) goes to Slack via api/feedback.js. Rendered at the
// App root so it can appear over any view.
export default function FeedbackOverlay({ view, onClose }) {
  const [message, setMessage] = useState('');
  const [recording, setRecording] = useState(false);
  const [liveText, setLiveText] = useState('');
  const [status, setStatus] = useState('idle'); // idle | sending | sent | error
  const dictationRef = useRef(null);

  useEffect(() => {
    navigator.vibrate?.(10);
    return () => dictationRef.current?.stop();
  }, []);

  const toggleRecording = async () => {
    if (recording) {
      const controller = dictationRef.current;
      dictationRef.current = null;
      setRecording(false);
      controller?.stop();
      let transcript = '';
      try {
        transcript = (await controller?.finalPromise) || '';
      } catch {
        transcript = '';
      }
      transcript = transcript.trim();
      setLiveText('');
      if (transcript) {
        setMessage((prev) => (prev.trim() ? `${prev.trim()} ${transcript}` : transcript));
      }
      return;
    }
    if (!isDictationSupported()) return;
    try {
      setLiveText('');
      dictationRef.current = startDictation({ onResult: (t) => setLiveText(t) });
      setRecording(true);
    } catch {
      setRecording(false);
    }
  };

  const send = async () => {
    const trimmed = message.trim();
    if (!trimmed || status === 'sending') return;
    setStatus('sending');
    try {
      await sendFeedback({ message: trimmed, view });
      setStatus('sent');
      setTimeout(onClose, 900);
    } catch {
      setStatus('error');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-ink/95 px-6 pt-14 pb-8 text-parchment">
      <div className="flex items-center justify-between">
        <span className="font-sans text-lg font-semibold">Send feedback</span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="flex h-9 w-9 items-center justify-center border-none bg-transparent text-2xl text-parchment/60"
        >
          ×
        </button>
      </div>

      <p className="mt-1 font-sans text-sm text-parchment/50">
        Type or record a quick note — it goes straight to the developer.
      </p>

      <textarea
        autoFocus
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder="What's on your mind?"
        className="mt-6 h-28 shrink-0 resize-none rounded-lg border border-parchment/20 bg-transparent p-3 font-serif text-lg text-parchment placeholder:text-parchment/30 focus:border-amber-300/60 focus:outline-none"
      />

      {recording && (
        <p className="mt-2 font-serif text-sm italic text-amber-300/90">{liveText || 'Listening…'}</p>
      )}

      {status === 'error' && (
        <p className="mt-2 font-sans text-sm text-red-300">Couldn't send — check your connection and try again.</p>
      )}

      <div className="mt-6 flex items-center gap-3">
        {isDictationSupported() && (
          <button
            type="button"
            onClick={toggleRecording}
            aria-label={recording ? 'Stop recording' : 'Record a voice note'}
            className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-full border-2 ${
              recording ? 'border-amber-300 bg-amber-400/20' : 'border-parchment/30 bg-black/30'
            }`}
          >
            <span
              className={`bg-amber-400 ${recording ? 'h-4 w-4 rounded-sm animate-pulse' : 'h-5 w-5 rounded-full'}`}
            />
          </button>
        )}
        <button
          type="button"
          onClick={send}
          disabled={!message.trim() || status === 'sending'}
          className="h-14 flex-1 rounded-full border-none bg-amber-300 font-sans text-base font-semibold text-ink disabled:opacity-30"
        >
          {status === 'sending' ? 'Sending…' : status === 'sent' ? 'Sent ✓' : 'Send'}
        </button>
      </div>
    </div>
  );
}
