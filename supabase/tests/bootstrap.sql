-- Disposable local test database ONLY; substitutes the Supabase Auth schema.
create role anon nologin; create role authenticated nologin;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid$$;
create table auth.users(id uuid primary key, email text, email_confirmed_at timestamptz);
create table auth.identities(user_id uuid, provider text, identity_data jsonb);
grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;
insert into auth.users values ('00000000-0000-0000-0000-000000000001','owner@example.test',now()), ('00000000-0000-0000-0000-000000000002','other@example.test',now());
insert into auth.identities values ('00000000-0000-0000-0000-000000000001','google','{"email":"owner@example.test","email_verified":true}'), ('00000000-0000-0000-0000-000000000002','google','{"email":"other@example.test","email_verified":true}');
