-- Runs once on first DB start (plain postgres image).
-- Creates the roles/schema that Supabase Auth (GoTrue) and PostgREST expect.
\set pgpass `echo "$POSTGRES_PASSWORD"`

-- API roles used by PostgREST (JWT "role" claim)
create role anon nologin noinherit;
create role authenticated nologin noinherit;
create role service_role nologin noinherit bypassrls;

-- PostgREST connects as authenticator and switches to the JWT role
create role authenticator noinherit login password :'pgpass';
grant anon, authenticated, service_role to authenticator;

-- Supabase Auth owns the auth schema and runs its own migrations there
create role supabase_auth_admin noinherit createrole login password :'pgpass';
create schema if not exists auth authorization supabase_auth_admin;
grant create on database postgres to supabase_auth_admin;
alter role supabase_auth_admin set search_path = 'auth';

-- Let API roles see the public + auth schema functions (auth.uid() in RLS policies)
grant usage on schema public to anon, authenticated, service_role;
grant usage on schema auth to anon, authenticated, service_role;
alter default privileges for role supabase_auth_admin in schema auth
  grant execute on functions to anon, authenticated, service_role;
