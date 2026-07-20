import { useState } from 'react';

const WELCOMED_KEY = 'boswell_welcomed';

export const hasSeenWelcome = () => localStorage.getItem(WELCOMED_KEY) === 'true';
export const markWelcomeSeen = () => localStorage.setItem(WELCOMED_KEY, 'true');

const GESTURES = [
  'Drag your finger over text to capture it.',
  'Triple-tap the title area to log a title.',
  "Add a quick voice note to anything you've captured.",
  'Two-finger press and hold, anywhere, to send feedback — I read every one, and I appreciate it.',
];

const STEP_COUNT = 3;

// A simple, calm line drawing of the core gesture — a phone framing a page
// of text, with the middle few lines highlighted (matching the real
// in-app amber capture-ticks) and a fingertip dragging down over them.
// Purely decorative, so it's fine as one unlabeled SVG rather than needing
// alt text elsewhere on the page.
const CaptureIllustration = () => (
  <svg viewBox="0 0 160 260" width="150" height="244" fill="none" aria-hidden="true">
    <rect x="25" y="15" width="110" height="230" rx="16" stroke="currentColor" strokeOpacity="0.5" strokeWidth="3" />
    <line x1="45" y1="55" x2="130" y2="55" stroke="currentColor" strokeOpacity="0.3" strokeWidth="4" strokeLinecap="round" />
    <line x1="45" y1="72" x2="118" y2="72" stroke="currentColor" strokeOpacity="0.3" strokeWidth="4" strokeLinecap="round" />
    <rect x="40" y="86" width="95" height="66" rx="6" fill="#fcd34d" fillOpacity="0.22" />
    <line x1="45" y1="94" x2="128" y2="94" stroke="currentColor" strokeOpacity="0.45" strokeWidth="4" strokeLinecap="round" />
    <line x1="45" y1="111" x2="120" y2="111" stroke="currentColor" strokeOpacity="0.45" strokeWidth="4" strokeLinecap="round" />
    <line x1="45" y1="128" x2="112" y2="128" stroke="currentColor" strokeOpacity="0.45" strokeWidth="4" strokeLinecap="round" />
    <line x1="45" y1="145" x2="100" y2="145" stroke="currentColor" strokeOpacity="0.3" strokeWidth="4" strokeLinecap="round" />
    <line x1="45" y1="162" x2="122" y2="162" stroke="currentColor" strokeOpacity="0.3" strokeWidth="4" strokeLinecap="round" />
    <line x1="45" y1="179" x2="108" y2="179" stroke="currentColor" strokeOpacity="0.3" strokeWidth="4" strokeLinecap="round" />
    <path d="M87 90 V148" stroke="#f59e0b" strokeWidth="2.5" strokeDasharray="4 5" strokeLinecap="round" />
    <circle cx="87" cy="90" r="7" fill="#f59e0b" />
    <path d="M80 145 L87 155 L94 145" stroke="#f59e0b" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

// Shown once, the first time a session lands on this device (see App.jsx —
// gated on hasSeenWelcome, a local flag, not synced — a fresh device
// re-seeing this once is fine, arguably useful). Three short steps —
// what this is for, then how the core gesture actually works, then the
// rest of the gestures — rather than one dense screen, after real
// first-time users said the app was confusing to land in cold.
export default function WelcomeScreen({ onDone }) {
  const [step, setStep] = useState(0);

  const dismiss = () => {
    markWelcomeSeen();
    onDone();
  };

  const advance = () => (step < STEP_COUNT - 1 ? setStep((s) => s + 1) : dismiss());

  return (
    <div
      className="flex h-svh w-full flex-col items-center justify-center gap-8 px-8"
      style={{ background: 'var(--bg)', color: 'rgb(var(--fg))' }}
    >
      {step === 0 && (
        <div className="max-w-xs text-center">
          <div className="font-display text-[34px] leading-none">Boswell</div>
          <p className="mt-3 font-serif text-base leading-relaxed" style={{ color: 'rgb(var(--fg) / .75)' }}>
            Boswell is a simple way to keep notes as you read — the passages, excerpts, and thoughts that stick with
            you, saved without having to stop and write them down.
          </p>
        </div>
      )}

      {step === 1 && (
        <div className="flex max-w-xs flex-col items-center text-center">
          <div style={{ color: 'rgb(var(--fg) / .85)' }}>
            <CaptureIllustration />
          </div>
          <p className="mt-2 font-serif text-base leading-relaxed" style={{ color: 'rgb(var(--fg) / .75)' }}>
            Point your camera at the page — make sure the text is clearly in view — then drag your finger down over
            the words you want to keep.
          </p>
        </div>
      )}

      {step === 2 && (
        <div className="flex w-full max-w-xs flex-col gap-2.5 text-left">
          <p className="mb-1 text-center font-serif text-base" style={{ color: 'rgb(var(--fg) / .75)' }}>
            A few more things worth knowing:
          </p>
          {GESTURES.map((g) => (
            <p key={g} className="font-sans text-sm leading-snug" style={{ color: 'rgb(var(--fg) / .65)' }}>
              <span style={{ color: 'rgb(var(--fg) / .3)' }}>— </span>
              {g}
            </p>
          ))}
        </div>
      )}

      <div className="flex w-full max-w-xs flex-col items-center gap-4">
        <div className="flex gap-1.5">
          {Array.from({ length: STEP_COUNT }).map((_, i) => (
            <span
              key={i}
              className="h-1.5 w-1.5 rounded-full"
              style={{ background: i === step ? 'rgb(var(--acc))' : 'rgb(var(--fg) / .2)' }}
            />
          ))}
        </div>
        <button
          type="button"
          onClick={advance}
          className="h-12 w-full rounded-full border-none font-sans text-sm font-semibold"
          style={{ background: 'rgb(var(--acc))', color: 'rgb(var(--on-acc))' }}
        >
          {step < STEP_COUNT - 1 ? 'Next' : 'Got it'}
        </button>
      </div>
    </div>
  );
}
