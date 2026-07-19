-- Run this once in the Supabase SQL Editor (Project -> SQL Editor -> New query).
-- Creates the passages table and locks it down with Row Level Security so
-- each signed-in user can only ever see/edit their own rows.

create table public.passages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  captured_at timestamptz not null default now(),
  raw_text text,
  refined_text text not null,
  context text,
  page_number text,
  source_title text,
  source_author text,
  selection_bounds jsonb,
  touch_path jsonb,
  is_merged boolean not null default false,
  merged_from_ids jsonb not null default '[]'::jsonb,
  priority boolean not null default false,
  audio_transcript text,
  stack_id uuid,
  created_at timestamptz not null default now()
);

alter table public.passages enable row level security;

create policy "Users can view their own passages"
  on public.passages for select
  using (auth.uid() = user_id);

create policy "Users can insert their own passages"
  on public.passages for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own passages"
  on public.passages for update
  using (auth.uid() = user_id);

create policy "Users can delete their own passages"
  on public.passages for delete
  using (auth.uid() = user_id);

create index passages_user_id_idx on public.passages(user_id);
create index passages_captured_at_idx on public.passages(captured_at desc);
