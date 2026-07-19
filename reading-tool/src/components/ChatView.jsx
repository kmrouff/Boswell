import { useEffect, useRef, useState } from 'react';
import { getPassages } from '../lib/storage.js';
import { chatWithPassages } from '../lib/claude.js';

const SUGGESTIONS = [
  { text: 'Summarize what I’ve saved so far', populateOnly: false },
  { text: 'What themes connect these passages?', populateOnly: false },
  { text: 'What was that bit about…?', populateOnly: true },
  { text: 'Which passage should I revisit?', populateOnly: false },
];

export default function ChatView({ onCiteJump }) {
  const [messages, setMessages] = useState([]); // { role, content, citation? }
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [passageCount, setPassageCount] = useState(0);
  const scrollRef = useRef(null);

  useEffect(() => {
    const refresh = async () => setPassageCount((await getPassages()).length);
    refresh();
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
      const { citation } = await chatWithPassages(
        nextMessages.map((m) => ({ role: m.role, content: m.content })),
        await getPassages(),
        (_delta, displayText) => {
          setMessages((prev) => {
            const copy = [...prev];
            copy[copy.length - 1] = { role: 'assistant', content: displayText };
            return copy;
          });
        }
      );
      if (citation) {
        setMessages((prev) => {
          const copy = [...prev];
          copy[copy.length - 1] = { ...copy[copy.length - 1], citation };
          return copy;
        });
      }
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

  const pickSuggestion = (s) => {
    if (s.populateOnly) setInput('What was that bit about ');
    else send(s.text);
  };

  const showEmpty = messages.length === 0;

  return (
    <div className="flex h-full flex-col">
      <header
        className="flex shrink-0 items-baseline justify-between px-[18px] pt-[56px] pb-3.5"
        style={{ borderBottom: '1px solid rgb(var(--fg) / .1)' }}
      >
        <span className="font-display text-[30px] leading-none" style={{ color: 'rgb(var(--fg))' }}>
          Chat
        </span>
        <span className="font-serif text-[13px] italic" style={{ color: 'rgb(var(--fg) / .5)' }}>
          over {passageCount} {passageCount === 1 ? 'passage' : 'passages'}
        </span>
        {messages.length > 0 && (
          <button
            type="button"
            onClick={clearChat}
            disabled={streaming}
            className="ml-3 font-sans text-xs underline disabled:opacity-40"
            style={{ color: 'rgb(var(--fg) / .5)' }}
          >
            Clear
          </button>
        )}
      </header>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto p-[18px]">
        {showEmpty ? (
          <div className="flex h-full flex-col items-center justify-center gap-5 text-center">
            {passageCount === 0 ? (
              <>
                <p className="font-serif text-lg" style={{ color: 'rgb(var(--fg) / .7)' }}>
                  Nothing to chat about yet
                </p>
                <p className="max-w-xs font-sans text-sm" style={{ color: 'rgb(var(--fg) / .4)' }}>
                  Capture a few passages first, then come back to ask questions across everything you’ve saved.
                </p>
              </>
            ) : (
              <>
                <div className="max-w-[260px] font-display text-[27px] leading-[1.15]" style={{ color: 'rgb(var(--fg) / .8)' }}>
                  Ask about what you’ve read.
                </div>
                <div className="flex w-full flex-col gap-2.5">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s.text}
                      type="button"
                      onClick={() => pickSuggestion(s)}
                      className="min-h-11 rounded-2xl border-none px-4 py-3 text-left font-serif text-[15px] transition-transform duration-150 active:scale-[0.985]"
                      style={{ background: 'rgb(var(--fg) / .06)', color: 'rgb(var(--fg) / .85)' }}
                    >
                      {s.text}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {messages.map((m, i) => (
              <div key={i} className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
                <div
                  className="max-w-[88%] whitespace-pre-wrap font-serif text-[15px] leading-[1.55]"
                  style={
                    m.role === 'user'
                      ? {
                          background: 'rgb(var(--fill))',
                          color: 'rgb(var(--on-fill))',
                          borderRadius: '18px 18px 4px 18px',
                          padding: '11px 15px',
                          maxWidth: '85%',
                        }
                      : {
                          background: 'rgb(var(--fg) / .07)',
                          color: 'rgb(var(--fg))',
                          borderRadius: '18px 18px 18px 4px',
                          padding: '13px 16px',
                        }
                  }
                >
                  <span>{m.content || (streaming && i === messages.length - 1 ? '…' : '')}</span>
                  {m.citation && m.content && (!streaming || i !== messages.length - 1) && (
                    <button
                      type="button"
                      onClick={() => onCiteJump?.(m.citation.id)}
                      className="mt-2.5 flex items-center gap-1.5 rounded-full border font-sans text-xs font-semibold"
                      style={{
                        background: 'rgb(var(--acc) / .14)',
                        borderColor: 'rgb(var(--acc) / .4)',
                        color: 'rgb(var(--acc))',
                        padding: '5px 12px',
                      }}
                    >
                      ↗ {m.citation.label}
                    </button>
                  )}
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
        className="flex shrink-0 items-center gap-2.5 p-3"
        style={{ borderTop: '1px solid rgb(var(--fg) / .1)' }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={passageCount === 0 ? 'Capture something first…' : 'Ask about your passages…'}
          disabled={passageCount === 0}
          className="h-[46px] flex-1 rounded-full border px-4 font-sans text-sm focus:outline-none disabled:opacity-40"
          style={{ background: 'rgb(var(--fg) / .04)', borderColor: 'rgb(var(--fg) / .2)', color: 'rgb(var(--fg))' }}
        />
        <button
          type="submit"
          disabled={streaming || !input.trim() || passageCount === 0}
          className="h-[46px] shrink-0 rounded-full border-none px-5 font-sans text-sm font-bold disabled:opacity-30"
          style={{ background: 'rgb(var(--acc))', color: 'rgb(var(--on-acc))' }}
        >
          Send
        </button>
      </form>
    </div>
  );
}
