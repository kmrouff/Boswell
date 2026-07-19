import { useEffect, useState } from 'react';
import { THEMES, THEME_NAMES, getStoredTheme, setStoredTheme, applyThemeVars, resolveTheme, getStoredAccent, getStoredRadius } from '../lib/theme.js';
import { supabase } from '../lib/supabaseClient.js';

const CONTACT_EMAIL = 'kevinrouff@gmail.com';

const MISSION_PARAGRAPHS = [
  "Boswell isn't trying to be clever, or to clutter up your reading with one more thing to manage. It's just a small, helpful scribe — quiet, out of the way, there when you need it.",
  "It came from an old habit of mine: drawing lines in margins, starring passages, dog-earing pages I meant to come back to and almost never did. Boswell is that habit, finally kept properly.",
  "We are what we read. A real book — the weight of it, the years already in the paper — holds something a screen doesn't. Books are wondrous things, and they shouldn't have to lose out to a Kindle just so the good lines don't get lost. Boswell is here so they don't have to.",
];

const PRIVACY_SECTIONS = [
  {
    heading: "What's stored",
    body: 'Your email, and whatever you capture — passage text, titles, page numbers, and any voice notes, kept as text.',
  },
  {
    heading: 'The photos',
    body: 'Each capture is read once for its text, then let go. The photo itself is never stored.',
  },
  {
    heading: 'Who sees it',
    body: "Just you — your library is walled off from everyone else's. Nothing here is ever sold, shared, or used for anything but running the app.",
  },
];

// Slides in from the right, covers the screen area (not the bottom nav —
// the caller renders this inside the view's own relatively-positioned root,
// which fills <main> only). Appearance is functional (switches the theme
// app-wide instantly via CSS custom properties on the document root).
// `panel` drives an in-place drill-down (menu -> mission/privacy), iOS
// Settings-style, rather than stacking a second overlay on top of this one.
export default function SettingsDrawer({ open, onClose }) {
  const [activeTheme, setActiveTheme] = useState(() => getStoredTheme());
  const [email, setEmail] = useState(null);
  const [panel, setPanel] = useState('menu'); // menu | mission | privacy

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setEmail(data.session?.user?.email ?? null));
  }, []);

  // Reset to the main menu once the drawer has fully closed, so reopening it
  // later doesn't land back on whatever sub-page was open last time.
  useEffect(() => {
    if (!open) setPanel('menu');
  }, [open]);

  const pickTheme = (name) => {
    setStoredTheme(name);
    setActiveTheme(name);
    applyThemeVars(resolveTheme(name, getStoredAccent(), getStoredRadius()));
  };

  const logOut = () => supabase.auth.signOut();

  const openFeedback = () => {
    onClose();
    window.dispatchEvent(new CustomEvent('open-feedback'));
  };

  const panelTitle = panel === 'mission' ? 'Mission' : panel === 'privacy' ? 'Privacy' : 'Settings';
  const panelSections = panel === 'privacy' ? PRIVACY_SECTIONS : null;

  return (
    <>
      <div
        onClick={onClose}
        className="absolute inset-0 z-40 bg-black/45 transition-opacity duration-300"
        style={{ opacity: open ? 1 : 0, pointerEvents: open ? 'auto' : 'none' }}
      />
      <div
        className="absolute inset-y-0 right-0 z-50 w-[86%] overflow-y-auto px-5 pt-[54px] pb-6 transition-transform duration-300"
        style={{
          background: 'var(--bg)',
          transform: `translateX(${open ? '0%' : '100%'})`,
          transitionTimingFunction: 'cubic-bezier(.22,.61,.36,1)',
        }}
      >
        <div className="mb-6 flex items-center gap-2">
          {panel !== 'menu' && (
            <button
              type="button"
              onClick={() => setPanel('menu')}
              aria-label="Back to settings"
              className="flex h-10 w-10 shrink-0 items-center justify-center border-none bg-transparent text-2xl leading-none transition-transform duration-150 active:scale-[0.85]"
              style={{ color: 'rgb(var(--fg) / .6)' }}
            >
              ‹
            </button>
          )}
          <span className="flex-1 font-display text-[27px]" style={{ color: 'rgb(var(--fg))' }}>
            {panelTitle}
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close settings"
            className="flex h-10 w-10 shrink-0 items-center justify-center border-none bg-transparent text-2xl leading-none transition-transform duration-150 active:scale-[0.85]"
            style={{ color: 'rgb(var(--fg) / .6)' }}
          >
            ×
          </button>
        </div>

        {panel === 'mission' && (
          <div className="flex flex-col gap-4">
            {MISSION_PARAGRAPHS.map((p, i) => (
              <p key={i} className="font-serif text-base leading-relaxed" style={{ color: 'rgb(var(--fg) / .85)' }}>
                {p}
              </p>
            ))}
          </div>
        )}

        {panelSections && (
          <div className="flex flex-col gap-5">
            {panelSections.map(({ heading, body }) => (
              <div key={heading}>
                <div
                  className="mb-1 font-sans text-[11px] font-semibold tracking-wide uppercase"
                  style={{ color: 'rgb(var(--fg) / .4)' }}
                >
                  {heading}
                </div>
                <p className="font-serif text-base leading-relaxed" style={{ color: 'rgb(var(--fg) / .85)' }}>
                  {body}
                </p>
              </div>
            ))}
          </div>
        )}

        {panel === 'menu' && (
          <>
            <div
              className="mb-2.5 font-sans text-[11px] font-semibold tracking-wide uppercase"
              style={{ color: 'rgb(var(--fg) / .4)' }}
            >
              Appearance
            </div>
            <div className="mb-7 flex flex-col gap-2">
              {THEME_NAMES.map((name) => {
                const th = THEMES[name];
                const active = name === activeTheme;
                return (
                  <button
                    key={name}
                    type="button"
                    onClick={() => pickTheme(name)}
                    className="flex items-center gap-3 rounded-xl border-none px-2.5 py-2 text-left"
                    style={{ background: active ? 'rgb(var(--acc) / .12)' : 'rgb(var(--fg) / .05)' }}
                  >
                    <span
                      className="inline-flex h-[30px] w-[46px] items-center justify-center gap-1 rounded-lg"
                      style={{ background: th.bg, boxShadow: 'inset 0 0 0 1px rgba(0,0,0,.12)' }}
                    >
                      <span className="h-2 w-2 rounded-full" style={{ background: `rgb(${th.fg})` }} />
                      <span className="h-2 w-2 rounded-full" style={{ background: `rgb(${th.acc})` }} />
                    </span>
                    <span className="flex-1 font-sans text-sm" style={{ color: 'rgb(var(--fg))' }}>
                      {name}
                    </span>
                    {active && (
                      <span style={{ color: 'rgb(var(--acc))' }} className="text-[15px]">
                        ✓
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            <div
              className="mb-1 font-sans text-[11px] font-semibold tracking-wide uppercase"
              style={{ color: 'rgb(var(--fg) / .4)' }}
            >
              About
            </div>
            <button
              type="button"
              onClick={() => setPanel('mission')}
              className="flex w-full items-center justify-between border-0 border-b bg-transparent py-3.5 text-left font-sans text-sm"
              style={{ borderColor: 'rgb(var(--fg) / .08)', color: 'rgb(var(--fg) / .85)' }}
            >
              Mission
              <span style={{ color: 'rgb(var(--fg) / .3)' }} className="text-lg">›</span>
            </button>
            <button
              type="button"
              onClick={() => setPanel('privacy')}
              className="flex w-full items-center justify-between border-0 border-b bg-transparent py-3.5 text-left font-sans text-sm"
              style={{ borderColor: 'rgb(var(--fg) / .08)', color: 'rgb(var(--fg) / .85)' }}
            >
              Privacy
              <span style={{ color: 'rgb(var(--fg) / .3)' }} className="text-lg">›</span>
            </button>

            <div className="my-6 h-px" style={{ background: 'rgb(var(--fg) / .1)' }} />

            <div
              className="mb-1 font-sans text-[11px] font-semibold tracking-wide uppercase"
              style={{ color: 'rgb(var(--fg) / .4)' }}
            >
              Support
            </div>
            <button
              type="button"
              onClick={openFeedback}
              className="flex w-full items-center justify-between border-0 border-b bg-transparent py-3.5 text-left font-sans text-sm"
              style={{ borderColor: 'rgb(var(--fg) / .08)', color: 'rgb(var(--fg) / .85)' }}
            >
              Send feedback
              <span style={{ color: 'rgb(var(--fg) / .3)' }} className="text-lg">›</span>
            </button>
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="flex w-full items-center justify-between border-0 border-b bg-transparent py-3.5 text-left font-sans text-sm no-underline"
              style={{ borderColor: 'rgb(var(--fg) / .08)', color: 'rgb(var(--fg) / .85)' }}
            >
              Contact us
              <span style={{ color: 'rgb(var(--fg) / .3)' }} className="text-lg">›</span>
            </a>

            <div className="my-6 h-px" style={{ background: 'rgb(var(--fg) / .1)' }} />

            <div
              className="mb-1 font-sans text-[11px] font-semibold tracking-wide uppercase"
              style={{ color: 'rgb(var(--fg) / .4)' }}
            >
              Account
            </div>
            {email && (
              <div
                className="flex items-center justify-between border-b py-3.5 font-sans text-sm"
                style={{ borderColor: 'rgb(var(--fg) / .08)', color: 'rgb(var(--fg) / .85)' }}
              >
                {email}
              </div>
            )}
            <button
              type="button"
              onClick={logOut}
              className="flex w-full items-center justify-between border-0 border-b bg-transparent py-3.5 text-left font-sans text-sm"
              style={{ borderColor: 'rgb(var(--fg) / .08)', color: 'rgb(var(--fg) / .85)' }}
            >
              Log out
            </button>
          </>
        )}
      </div>
    </>
  );
}
