import { useEffect, useRef, useState } from 'react';
import { getPassages } from '../lib/storage.js';
import { chatWithPassages } from '../lib/claude.js';

const SUGGESTIONS = [
  'Summarize what I’ve saved so far',
  'What themes connect these passages?',
  'What was that bit about …?',
  'Which passage should I revisit?',
];

export default function ChatView() {
  const [messages, setMessages] = useState([]); // { role, content }
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [passageCount, setPassageCount] = useState(() => getPassages().length);
  const scrollRef = useRef(null);

  useEffect(() => {
    const refresh = () => setPassageCount(getPassages().length);
    window.addEventListener('passage-saved', refresh);
    return () => window.removeEventListener('passage-saved', refresh);
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  const send = async (text) => {
    const trimmed = text.trim();
    if (!trimmed || streaming) return;
    setInput('');

    const nextMessages = [...messages, { role: 'user', content: trimmed }];
    // Placeholder assistant message that fills in as the stream arrives.
    setMessages([...nextMessages, { role: 'assistant', content: '' }]);
    setStreaming(true);

    try {
      await chatWithPassages(
        nextMessages.map((m) => ({ role: m.role, content: m.content })),
        getPassages(),
        (_delta, full) => {
          setMessages((prev) => {
            const copy = [...prev];
            copy[copy.length - 1] = { role: 'assistant', content: full };
            return copy;
          });
        }
      );
    } catch {
      setMessages((prev) => {
        const copy = [...prev];
        copy[copy.length - 1] = {
          role: 'assistant',
          content: 'Something went wrong reaching the assistant. Please try again.',
        };
        return copy;
      });
    } finally {
      setStreaming(false);
    }
  };

  const clearChat = () => {
    if (streaming) return;
    setMessages([]);
  };

  const showEmpty = messages.length === 0;

  return (
    <div className="flex h-full flex-col">
      <header className="flex shrink-0 items-center justify-between border-b border-parchment/10 px-4 py-3">
        <span className="text-sm text-parchment/60">
          Chat over {passageCount} {passageCount === 1 ? 'passage' : 'passages'}
        </span>
        {messages.length > 0 && (
          <button
            type="button"
            onClick={clearChat}
            disabled={streaming}
            className="text-xs text-parchment/50 underline disabled:opacity-40 hover:text-parchment/80"
          >
            Clear
          </button>
        )}
      </header>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {showEmpty ? (
          <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
            {passageCount === 0 ? (
              <>
                <p className="text-lg text-parchment/70">Nothing to chat about yet</p>
                <p className="max-w-xs text-sm text-parchment/40">
                  Capture a few passages first, then come back to ask questions across everything you’ve saved.
                </p>
              </>
            ) : (
              <>
                <p className="text-lg text-parchment/70">Ask about what you’ve read</p>
                <div className="flex flex-col gap-2">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => send(s)}
                      className="rounded-full border border-parchment/20 px-4 py-2 text-sm text-parchment/80 hover:border-parchment/40"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {messages.map((m, i) => (
              <div
                key={i}
                className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}
              >
                <div
                  className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2 text-sm ${
                    m.role === 'user'
                      ? 'bg-parchment text-ink'
                      : 'border border-parchment/10 bg-parchment/5 text-parchment'
                  }`}
                >
                  {m.content || (streaming ? '…' : '')}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="flex shrink-0 items-end gap-2 border-t border-parchment/10 p-3"
      >
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              send(input);
            }
          }}
          rows={1}
          placeholder={passageCount === 0 ? 'Capture something first…' : 'Ask about your passages…'}
          disabled={passageCount === 0}
          className="max-h-32 min-h-[2.5rem] flex-1 resize-none rounded-2xl border border-parchment/20 bg-transparent px-4 py-2 text-sm text-parchment placeholder:text-parchment/30 focus:border-parchment/40 focus:outline-none disabled:opacity-40"
        />
        <button
          type="submit"
          disabled={streaming || !input.trim() || passageCount === 0}
          className="h-10 shrink-0 rounded-full bg-parchment px-4 text-sm font-medium text-ink disabled:opacity-30"
        >
          Send
        </button>
      </form>
    </div>
  );
}
