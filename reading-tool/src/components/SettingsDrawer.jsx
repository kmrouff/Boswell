import { useState } from 'react';
import { THEMES, THEME_NAMES, getStoredTheme, setStoredTheme, applyThemeVars, resolveTheme, getStoredAccent, getStoredRadius } from '../lib/theme.js';

// Slides in from the right, covers the screen area (not the bottom nav —
// the caller renders this inside the view's own relatively-positioned root,
// which fills <main> only). Appearance is functional (switches the theme
// app-wide instantly via CSS custom properties on the document root);
// Support/Account are placeholders per the handoff spec.
export default function SettingsDrawer({ open, onClose }) {
  const [activeTheme, setActiveTheme] = useState(() => getStoredTheme());

  const pickTheme = (name) => {
    setStoredTheme(name);
    setActiveTheme(name);
    applyThemeVars(resolveTheme(name, getStoredAccent(), getStoredRadius()));
  };

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
        <div className="mb-6 flex items-center justify-between">
          <span className="font-display text-[27px]" style={{ color: 'rgb(var(--fg))' }}>
            Settings
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close settings"
            className="flex h-10 w-10 items-center justify-center border-none bg-transparent text-2xl leading-none transition-transform duration-150 active:scale-[0.85]"
            style={{ color: 'rgb(var(--fg) / .6)' }}
          >
            ×
          </button>
        </div>

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
          Support
        </div>
        {['Send feedback', 'Contact us'].map((label) => (
          <button
            key={label}
            type="button"
            className="flex w-full items-center justify-between border-0 border-b bg-transparent py-3.5 text-left font-sans text-sm"
            style={{ borderColor: 'rgb(var(--fg) / .08)', color: 'rgb(var(--fg) / .85)' }}
          >
            {label}
            <span style={{ color: 'rgb(var(--fg) / .3)' }} className="text-lg">›</span>
          </button>
        ))}

        <div className="my-6 h-px" style={{ background: 'rgb(var(--fg) / .1)' }} />

        <div
          className="mb-1 font-sans text-[11px] font-semibold tracking-wide uppercase"
          style={{ color: 'rgb(var(--fg) / .4)' }}
        >
          Account
        </div>
        {['Log in', 'Privacy policy'].map((label) => (
          <div
            key={label}
            className="flex items-center justify-between border-b py-3.5 font-sans text-sm"
            style={{ borderColor: 'rgb(var(--fg) / .08)', color: 'rgb(var(--fg) / .4)' }}
          >
            {label}
            <span
              className="rounded-full border px-2 py-0.5 text-[10px] tracking-wide uppercase"
              style={{ borderColor: 'rgb(var(--fg) / .18)' }}
            >
              Soon
            </span>
          </div>
        ))}
      </div>
    </>
  );
}
