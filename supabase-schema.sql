-- GerLinx Sprachtest — run once in Supabase SQL Editor
create extension if not exists pgcrypto;

-- Candidate profile linked to Supabase Auth
create table if not exists public.candidates (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text not null,
  date_of_birth date not null,
  city text not null,
  mobile_number text not null,
  created_at timestamptz default now()
);

-- Individual 1.00 EUR test attempts
create table if not exists public.exam_attempts (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references public.candidates(id) on delete cascade,
  stripe_session_id text unique,
  paid boolean default false,
  completed boolean default false,
  grading_locked boolean default false,   -- prevents double submission while Gemini grades
  questions jsonb,
  total_score integer,
  passed boolean,
  cefr_estimate text,
  evaluation_json jsonb,
  created_at timestamptz default now(),
  started_at timestamptz,
  completed_at timestamptz
);

create index if not exists exam_attempts_candidate_idx on public.exam_attempts(candidate_id);

alter table public.candidates enable row level security;
alter table public.exam_attempts enable row level security;

drop policy if exists "Users view own profile" on public.candidates;
create policy "Users view own profile" on public.candidates
  for select using (auth.uid() = id);

drop policy if exists "Users insert own profile" on public.candidates;
create policy "Users insert own profile" on public.candidates
  for insert with check (auth.uid() = id);

drop policy if exists "Users view own attempts" on public.exam_attempts;
create policy "Users view own attempts" on public.exam_attempts
  for select using (auth.uid() = candidate_id);

-- No insert/update policies on exam_attempts: only the server (service_role)
-- can create attempts, mark them paid, or write scores.

-- Table privileges (RLS above still restricts rows). Needed for self-hosted
-- PostgREST; harmless on Supabase Cloud where these are granted by default.
grant usage on schema public to anon, authenticated, service_role;
grant select, insert on public.candidates to authenticated;
grant select on public.exam_attempts to authenticated;
grant all on public.candidates, public.exam_attempts to service_role;

-- Auto-create the candidate profile from sign-up metadata.
-- Works even when "Confirm email" is ON (no client session yet at sign-up).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(new.raw_user_meta_data->>'full_name', '') <> ''
     and coalesce(new.raw_user_meta_data->>'date_of_birth', '') <> '' then
    insert into public.candidates (id, email, full_name, date_of_birth, city, mobile_number)
    values (
      new.id,
      new.email,
      new.raw_user_meta_data->>'full_name',
      (new.raw_user_meta_data->>'date_of_birth')::date,
      coalesce(new.raw_user_meta_data->>'city', ''),
      coalesce(new.raw_user_meta_data->>'mobile_number', '')
    )
    on conflict (id) do nothing;
  end if;
  return new;
exception when others then
  -- Never block account creation; the app will ask for the profile instead.
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
