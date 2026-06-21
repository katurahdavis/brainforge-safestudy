create extension if not exists pgcrypto;

create table if not exists public.learners (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  email_normalized text not null unique,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create table if not exists public.learner_progress (
  learner_id uuid primary key references public.learners(id) on delete cascade,
  app_version text not null default 'BrainForge_SAFEStudy_v1',
  deck_version text not null default 'SAFE_MASTER_v1',
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create index if not exists learners_email_normalized_idx on public.learners(email_normalized);
