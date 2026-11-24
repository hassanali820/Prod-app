-- Applied by the backend on every start (idempotent).

create table if not exists users (
  id               uuid primary key default gen_random_uuid(),
  email            text not null unique,
  password_hash    text not null,
  full_name        text not null,
  date_of_birth    date not null,
  city             text not null,
  mobile_number    text not null,
  reset_token_hash text,
  reset_expires_at timestamptz,
  created_at       timestamptz not null default now()
);

create table if not exists exam_attempts (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references users(id) on delete cascade,
  stripe_session_id text unique,
  paid              boolean not null default false,
  completed         boolean not null default false,
  grading_locked    boolean not null default false,  -- stops double submission while grading
  questions         jsonb,
  total_score       integer,
  passed            boolean,
  cefr_level        text,
  evaluation        jsonb,
  created_at        timestamptz not null default now(),
  started_at        timestamptz,
  completed_at      timestamptz
);

create index if not exists exam_attempts_user_idx on exam_attempts(user_id);
