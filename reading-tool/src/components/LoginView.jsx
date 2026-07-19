import { useState } from 'react';
import { supabase } from '../lib/supabaseClient.js';

// Shown whenever there's no active Supabase session — see App.jsx's
// auth-state gating. Magic-link only: type an email, get a one-time link,
// click it, you're in. No passwords anywhere in this app.
export default function LoginView() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState('idle'); // idle | sending | sent | error
  const [errorMessage, setErrorMessage] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed || status === 'sending') return;
    setStatus('sending');
    setErrorMessage('');
    const { error } = await supabase.auth.signInWithOtp({
      email: trimmed,
      options: { emailRedirectTo: window.location.origin },
    });
    if (error) {
      setStatus('error');
      setErrorMessage(error.message || 'Something went wrong — try again.');
      return;
    }
    setStatus('sent');
  };

  return (
    <div
      className="flex h-svh w-full flex-col items-center justify-center gap-8 px-8"
      style={{ background: 'var(--bg)', color: 'rgb(var(--fg))' }}
    >
      <div className="text-center">
        <div className="font-display text-[40px] leading-none">Reading Tool</div>
        <p className="mt-2 font-serif text-base italic" style={{ color: 'rgb(var(--fg) / .6)' }}>
          Capture passages as you read.
        </p>
      </div>

      {status === 'sent' ? (
        <div className="w-full max-w-xs text-center">
          <p className="font-serif text-lg" style={{ color: 'rgb(var(--fg))' }}>
            Check your email
          </p>
          <p className="mt-2 font-sans text-sm" style={{ color: 'rgb(var(--fg) / .6)' }}>
            We sent a sign-in link to {email.trim()} — open it on this device to continue.
          </p>
        </div>
      ) : (
        <form onSubmit={submit} className="flex w-full max-w-xs flex-col gap-3">
          <input
            autoFocus
            type="email"
            inputMode="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="h-12 rounded-full border px-5 font-sans text-sm focus:outline-none"
            style={{ background: 'rgb(var(--fg) / .04)', borderColor: 'rgb(var(--fg) / .2)', color: 'rgb(var(--fg))' }}
          />
          <button
            type="submit"
            disabled={!email.trim() || status === 'sending'}
            className="h-12 rounded-full border-none font-sans text-sm font-semibold disabled:opacity-40"
            style={{ background: 'rgb(var(--acc))', color: 'rgb(var(--on-acc))' }}
          >
            {status === 'sending' ? 'Sending…' : 'Send sign-in link'}
          </button>
          {status === 'error' && (
            <p className="text-center font-sans text-sm text-red-500">{errorMessage}</p>
          )}
        </form>
      )}
    </div>
  );
}
