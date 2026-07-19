const WELCOMED_KEY = 'boswell_welcomed';

export const hasSeenWelcome = () => localStorage.getItem(WELCOMED_KEY) === 'true';
export const markWelcomeSeen = () => localStorage.setItem(WELCOMED_KEY, 'true');

const GESTURES = [
  'Drag your finger over text to capture it.',
  'Triple-tap the title area to log a title.',
  "Add a quick voice note to anything you've captured.",
  'Two-finger press and hold, anywhere, to send feedback — I read every one, and I appreciate it.',
];

// Shown once, the first time a session lands on this device (see App.jsx —
// gated on hasSeenWelcome, a local flag, not synced — a fresh device
// re-seeing this once is fine, arguably useful). Same calm, text-forward
// style as LoginView rather than a multi-screen tour, which would read as
// more gimmicky than this app wants to be.
export default function WelcomeScreen({ onDone }) {
  const dismiss = () => {
    markWelcomeSeen();
    onDone();
  };

  return (
    <div
      className="flex h-svh w-full flex-col items-center justify-center gap-8 px-8"
      style={{ background: 'var(--bg)', color: 'rgb(var(--fg))' }}
    >
      <div className="max-w-xs text-center">
        <div className="font-display text-[34px] leading-none">Boswell</div>
        <p className="mt-3 font-serif text-base leading-relaxed" style={{ color: 'rgb(var(--fg) / .75)' }}>
          Drag your finger over a passage while you're reading, and it's saved — the lines, ideas, and thoughts that
          catch you, kept without breaking your stride.
        </p>
      </div>

      <div className="flex w-full max-w-xs flex-col gap-2.5 text-left">
        {GESTURES.map((g) => (
          <p key={g} className="font-sans text-sm leading-snug" style={{ color: 'rgb(var(--fg) / .65)' }}>
            <span style={{ color: 'rgb(var(--fg) / .3)' }}>— </span>
            {g}
          </p>
        ))}
      </div>

      <button
        type="button"
        onClick={dismiss}
        className="h-12 w-full max-w-xs rounded-full border-none font-sans text-sm font-semibold"
        style={{ background: 'rgb(var(--acc))', color: 'rgb(var(--on-acc))' }}
      >
        Got it
      </button>
    </div>
  );
}
