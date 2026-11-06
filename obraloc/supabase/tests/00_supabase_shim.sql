-- SOMENTE PARA TESTES LOCAIS (Postgres puro).
-- Recria o mínimo que o Supabase já oferece: papéis anon/authenticated/service_role,
-- o papel authenticator e auth.uid(). Nunca rode isto num projeto Supabase real.

do $$
begin
  if not exists (select from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
  if not exists (select from pg_roles where rolname = 'authenticator') then create role authenticator nologin noinherit; end if;
end $$;

grant anon, authenticated, service_role to authenticator;

create schema if not exists auth;
grant usage on schema auth to anon, authenticated, service_role;

create table if not exists auth.users (
  id uuid primary key,
  email text unique
);

-- Igual ao Supabase: lê o "sub" das claims da requisição.
create or replace function auth.uid() returns uuid
language sql stable as $$
  select nullif(
    coalesce(
      current_setting('request.jwt.claim.sub', true),
      (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
    ), ''
  )::uuid
$$;

grant execute on function auth.uid() to anon, authenticated, service_role;

-- O Supabase concede uso do schema public a esses papéis.
grant usage on schema public to anon, authenticated, service_role;
