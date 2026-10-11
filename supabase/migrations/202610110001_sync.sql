-- Run once in a user-owned Supabase project. No credentials or allowed email in this file.
begin;
create schema if not exists cat_days_private;
revoke all on schema cat_days_private from public, anon, authenticated;
create table cat_days_private.allowed_account (
  singleton boolean primary key default true check (singleton),
  email text not null check (email = lower(email))
);
create table cat_days_private.counters (owner_id uuid primary key, value bigint not null default 0);
create table cat_days_private.operations (
  owner_id uuid not null, operation_id uuid not null, request_hash bytea not null,
  result_id text not null, primary key(owner_id, operation_id)
);
-- Defense in depth: only owner-run security-definer functions use private tables.
alter table cat_days_private.allowed_account enable row level security;
alter table cat_days_private.counters enable row level security;
alter table cat_days_private.operations enable row level security;
create function public.cat_days_allowed() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from auth.users u join cat_days_private.allowed_account a on lower(u.email) = a.email
    where u.id = auth.uid() and u.email_confirmed_at is not null
    and exists (select 1 from auth.identities i where i.user_id = u.id and i.provider = 'google'
      and lower(i.identity_data->>'email') = a.email and i.identity_data->>'email_verified' = 'true')
  );
$$;
revoke all on function public.cat_days_allowed() from public, anon;
grant execute on function public.cat_days_allowed() to authenticated;
create table public.cat_days_notes (
  owner_id uuid not null references auth.users(id) on delete cascade,
  id text not null check (length(id) between 1 and 128),
  day date, body text, mood text, mood_text text, origin_id text,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  version bigint not null check (version > 0), change_seq bigint not null,
  deleted_at timestamptz,
  primary key(owner_id, id), unique(owner_id, change_seq),
  check (origin_id is null or length(origin_id) between 1 and 128),
  check ((deleted_at is not null and day is null and body is null and mood is null and mood_text is null and origin_id is null)
    or (deleted_at is null and day between date '1900-01-01' and date '2100-12-31'
      and body is not null and mood_text is not null and mood in ('', '🙂', '😌', '😐', '😔', '😣')
      and (length(trim(body)) > 0 or length(mood) > 0 or length(trim(mood_text)) > 0)))
);
alter table public.cat_days_notes enable row level security;
create policy owner_read on public.cat_days_notes for select to authenticated
  using (owner_id = (select auth.uid()) and (select public.cat_days_allowed()));
revoke all on public.cat_days_notes from public, anon, authenticated;
grant select on public.cat_days_notes to authenticated;

create function cat_days_private.record_json(n public.cat_days_notes) returns jsonb
language sql immutable set search_path = '' as $$
  select jsonb_build_object('id', n.id, 'date', n.day, 'text', n.body, 'mood', n.mood,
    'moodText', n.mood_text, 'originId', n.origin_id, 'version', n.version, 'changeSeq', n.change_seq,
    'createdAt', to_char(n.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'updatedAt', to_char(n.updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'deletedAt', case when n.deleted_at is null then null else to_char(n.deleted_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') end);
$$;
-- JS length counts astral Unicode characters as two UTF-16 units.
create function cat_days_private.utf16_length(t text) returns integer
language sql immutable strict set search_path = '' as $$
  select coalesce(sum(case when ascii(c) > 65535 then 2 else 1 end), 0)::integer
    from regexp_split_to_table(t, '') c;
$$;
create function public.cat_days_changes(p_after bigint default 0, p_limit integer default 200) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_owner uuid := auth.uid(); v_rows jsonb; v_cursor bigint;
begin
  if not public.cat_days_allowed() then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  if p_after is null or p_after < 0 or p_limit is null or p_limit not between 1 and 200 then raise exception 'INVALID_INPUT'; end if;
  -- Serialize writes for this owner so a committed lower cursor cannot arrive after a higher one.
  perform pg_advisory_xact_lock(hashtextextended(v_owner::text, 0));
  select coalesce(jsonb_agg(cat_days_private.record_json(q) order by q.change_seq), '[]'::jsonb), coalesce(max(q.change_seq), p_after)
    into v_rows, v_cursor from (select * from public.cat_days_notes where owner_id = v_owner and change_seq > p_after order by change_seq limit p_limit) q;
  return jsonb_build_object('records', v_rows, 'cursor', v_cursor,
    'hasMore', exists(select 1 from public.cat_days_notes where owner_id = v_owner and change_seq > v_cursor));
end;
$$;

create function public.cat_days_write(p_operation uuid, p_action text, p_id text, p_expected bigint,
  p_content jsonb default null, p_restore boolean default false) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_owner uuid := auth.uid(); v_current public.cat_days_notes; v_result public.cat_days_notes;
  v_receipt cat_days_private.operations; v_hash bytea; v_day date; v_seq bigint; v_id text := p_id;
  v_origin text; v_status text := 'saved';
begin
  if not public.cat_days_allowed() then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  if p_operation is null or p_action not in ('save', 'delete', 'import', 'copy', 'marker') or p_action is null
    or p_id is null or length(p_id) not between 1 and 128 or p_expected is null or p_expected < 0 or p_restore is null then raise exception 'INVALID_INPUT'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_owner::text, 0));
  v_hash := sha256(convert_to(jsonb_build_array(p_action, p_id, p_expected, p_content, p_restore)::text, 'UTF8'));
  select * into v_receipt from cat_days_private.operations where owner_id = v_owner and operation_id = p_operation;
  if found then
    if v_receipt.request_hash <> v_hash then raise exception 'OPERATION_REUSED'; end if;
    select * into v_result from public.cat_days_notes where owner_id = v_owner and id = v_receipt.result_id;
    return jsonb_build_object('status', 'replayed', 'record', cat_days_private.record_json(v_result));
  end if;
  select * into v_current from public.cat_days_notes where owner_id = v_owner and id = p_id;
  if p_action in ('save', 'delete') and ((v_current.id is null and p_expected <> 0)
    or (v_current.id is not null and (v_current.version <> p_expected or v_current.deleted_at is not null))) then
    return jsonb_build_object('status', case when v_current.deleted_at is not null then 'deleted' else 'conflict' end,
      'record', case when v_current.id is null then null else cat_days_private.record_json(v_current) end);
  end if;
  if p_action = 'marker' then
    -- Backup markers protect a fresh account but never delete current active notes.
    if v_current.id is not null then v_result := v_current; v_status := 'skipped'; end if;
  elsif p_action = 'delete' then
    if v_current.id is null then raise exception 'NOT_FOUND'; end if;
  else
    if jsonb_typeof(p_content) is distinct from 'object' or jsonb_typeof(p_content->'date') is distinct from 'string'
      or jsonb_typeof(p_content->'text') is distinct from 'string' or jsonb_typeof(p_content->'mood') is distinct from 'string'
      or jsonb_typeof(p_content->'moodText') is distinct from 'string'
      or (p_content->>'date') !~ '^\d{4}-\d{2}-\d{2}$'
      or cat_days_private.utf16_length(p_content->>'text') > 20000 or cat_days_private.utf16_length(p_content->>'moodText') > 20000
      or p_content->>'mood' not in ('', '🙂', '😌', '😐', '😔', '😣')
      or (length(trim(p_content->>'text')) = 0 and length(p_content->>'mood') = 0 and length(trim(p_content->>'moodText')) = 0)
      then raise exception 'INVALID_CONTENT'; end if;
    v_day := (p_content->>'date')::date;
    if v_day not between date '1900-01-01' and date '2100-12-31' then raise exception 'INVALID_DATE'; end if;
    if p_action = 'copy' then v_id := 'copy:' || p_operation::text; v_origin := p_id; v_status := 'copy'; end if;
    if p_action = 'import' and v_current.id is not null then
      if v_current.deleted_at is not null and not p_restore then
        return jsonb_build_object('status', 'deleted', 'record', cat_days_private.record_json(v_current));
      elsif v_current.deleted_at is null and v_current.day = v_day and v_current.body = p_content->>'text'
        and v_current.mood = p_content->>'mood' and v_current.mood_text = p_content->>'moodText' then
        v_status := 'skipped'; v_result := v_current;
      else
        v_id := 'copy:' || p_operation::text; v_origin := p_id; v_status := 'copy';
      end if;
    end if;
  end if;
  if v_result.id is null then
    if p_action not in ('delete','marker') and (v_current.id is null or v_id <> p_id)
      and (select count(*) from public.cat_days_notes where owner_id = v_owner and deleted_at is null) >= 5000 then raise exception 'NOTE_LIMIT'; end if;
    insert into cat_days_private.counters(owner_id, value) values (v_owner, 1)
      on conflict(owner_id) do update set value = cat_days_private.counters.value + 1 returning value into v_seq;
    if p_action = 'marker' then
      insert into public.cat_days_notes(owner_id, id, version, change_seq, deleted_at)
        values(v_owner, v_id, 1, v_seq, clock_timestamp()) returning * into v_result;
    elsif p_action = 'delete' then
      update public.cat_days_notes set day = null, body = null, mood = null, mood_text = null, origin_id = null,
        version = version + 1, change_seq = v_seq, updated_at = clock_timestamp(), deleted_at = clock_timestamp()
        where owner_id = v_owner and id = p_id returning * into v_result;
    elsif v_current.id is not null and v_id = p_id then
      update public.cat_days_notes set day = v_day, body = p_content->>'text', mood = p_content->>'mood', mood_text = p_content->>'moodText',
        version = version + 1, change_seq = v_seq, updated_at = clock_timestamp()
        where owner_id = v_owner and id = p_id returning * into v_result;
    else
      insert into public.cat_days_notes(owner_id, id, day, body, mood, mood_text, origin_id, version, change_seq)
        values(v_owner, v_id, v_day, p_content->>'text', p_content->>'mood', p_content->>'moodText', v_origin, 1, v_seq) returning * into v_result;
    end if;
  end if;
  insert into cat_days_private.operations values(v_owner, p_operation, v_hash, v_result.id);
  return jsonb_build_object('status', v_status, 'record', cat_days_private.record_json(v_result));
end;
$$;
revoke all on function public.cat_days_changes(bigint, integer), public.cat_days_write(uuid, text, text, bigint, jsonb, boolean) from public, anon;
grant execute on function public.cat_days_changes(bigint, integer), public.cat_days_write(uuid, text, text, bigint, jsonb, boolean) to authenticated;
revoke all on all functions in schema cat_days_private from public, anon, authenticated;
commit;
