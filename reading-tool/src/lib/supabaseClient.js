import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Set once .env has real values (see supabase_schema.sql for setup) — App.jsx
// shows a friendly setup message instead of a raw crash until then.
export const isSupabaseConfigured = Boolean(url && anonKey);

// The anon key is safe to ship in the client bundle (VITE_-prefixed,
// unlike ANTHROPIC_API_KEY) — Supabase enforces per-user access via the
// Row Level Security policies on the passages table (see
// supabase_schema.sql), not by keeping this key secret.
export const supabase = isSupabaseConfigured
  ? createClient(url, anonKey)
  : null;
