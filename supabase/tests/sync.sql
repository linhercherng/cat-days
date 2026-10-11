\set ON_ERROR_STOP on
do $$begin
 if (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
     where n.nspname='cat_days_private' and c.relname in ('allowed_account','counters','operations')
       and c.relrowsecurity) <> 3 then
   raise exception 'private tables must all enable RLS';
 end if;
end $$;
insert into cat_days_private.allowed_account(email) values ('owner@example.test');
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
do $$declare a jsonb; b jsonb; c jsonb; begin
 a := public.cat_days_write('10000000-0000-0000-0000-000000000001','save','note-a',0,'{"date":"2026-10-11","text":"原稿","mood":"","moodText":""}');
 if a->>'status' <> 'saved' or a#>>'{record,version}' <> '1' then raise exception 'create failed'; end if;
 b := public.cat_days_write('10000000-0000-0000-0000-000000000001','save','note-a',0,'{"date":"2026-10-11","text":"原稿","mood":"","moodText":""}');
 if b->>'status' <> 'replayed' then raise exception 'lost response duplicated'; end if;
 a := public.cat_days_write('10000000-0000-0000-0000-000000000002','save','note-a',1,'{"date":"2026-10-12","text":"甲修改","mood":"😌","moodText":""}');
 b := public.cat_days_write('10000000-0000-0000-0000-000000000003','save','note-a',1,'{"date":"2026-10-11","text":"乙修改","mood":"","moodText":""}');
 if b->>'status' <> 'conflict' or b#>>'{record,text}' <> '甲修改' then raise exception 'stale write overwrote'; end if;
 b := public.cat_days_write('10000000-0000-0000-0000-000000000004','import','note-a',0,'{"date":"2026-10-11","text":"匯入稿","mood":"","moodText":""}');
 if b->>'status' <> 'copy' then raise exception 'import conflict lost'; end if;
 a := public.cat_days_write('10000000-0000-0000-0000-000000000005','delete','note-a',2);
 if a#>>'{record,text}' is not null or a#>>'{record,date}' is not null or a#>>'{record,deletedAt}' is null then raise exception 'delete retained content'; end if;
 b := public.cat_days_write('10000000-0000-0000-0000-000000000006','save','note-a',2,'{"date":"2026-10-11","text":"舊稿","mood":"","moodText":""}');
 if b->>'status' <> 'deleted' then raise exception 'deleted resurrected'; end if;
 b := public.cat_days_write('10000000-0000-0000-0000-000000000007','import','note-a',0,'{"date":"2026-10-11","text":"舊稿","mood":"","moodText":""}');
 if b->>'status' <> 'deleted' then raise exception 'backup resurrected'; end if;
 c := public.cat_days_changes(0,1);
 if jsonb_array_length(c->'records') <> 1 or not (c->>'hasMore')::boolean then raise exception 'pagination failed'; end if;
 if (select count(*) from public.cat_days_notes) <> 2 then raise exception 'unexpected note count'; end if;
 b := public.cat_days_write('10000000-0000-0000-0000-000000000009','copy','note-a',0,'{"date":"2026-10-11","text":"明確另存","mood":"","moodText":""}');
 if b#>>'{record,originId}' <> 'note-a' or b#>>'{record,id}' = 'note-a' then raise exception 'explicit recovery resurrected ID'; end if;
 a := public.cat_days_write('10000000-0000-0000-0000-000000000010','marker','backup-deleted',0);
 if a#>>'{record,deletedAt}' is null then raise exception 'backup marker lost'; end if;
 b := public.cat_days_write('10000000-0000-0000-0000-000000000011','marker','copy:10000000-0000-0000-0000-000000000009',0);
 if b#>>'{record,deletedAt}' is not null or b->>'status' <> 'skipped' then raise exception 'backup marker deleted active note'; end if;
 begin perform public.cat_days_changes(0,null); raise exception 'null pagination accepted'; exception when raise_exception then if SQLERRM <> 'INVALID_INPUT' then raise; end if; end;
 begin
   perform public.cat_days_write('10000000-0000-0000-0000-000000000001','save','note-a',0,'{"date":"2026-10-11","text":"different request","mood":"","moodText":""}');
   raise exception 'operation reused accepted';
 exception when raise_exception then if SQLERRM <> 'OPERATION_REUSED' then raise; end if; end;
 begin
   perform public.cat_days_write('10000000-0000-0000-0000-000000000008','save','bad',0,jsonb_build_object('date','2026-10-11','text',repeat('🐱',10001),'mood','','moodText',''));
   raise exception 'length accepted';
 exception when raise_exception then if SQLERRM <> 'INVALID_CONTENT' then raise; end if; end;
 begin
   update public.cat_days_notes set body='bypass'; raise exception 'direct write accepted';
 exception when insufficient_privilege then null; end;
end$$;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';
do $$begin
 if (select count(*) from public.cat_days_notes) <> 0 then raise exception 'RLS leaked'; end if;
 begin perform public.cat_days_changes(); raise exception 'other account accepted'; exception when insufficient_privilege then null; end;
 begin perform public.cat_days_write('20000000-0000-0000-0000-000000000001','save','x',0,'{"date":"2026-10-11","text":"x","mood":"","moodText":""}'); raise exception 'other write accepted'; exception when insufficient_privilege then null; end;
end$$;
reset role; set role anon;
do $$begin
 begin perform public.cat_days_changes(); raise exception 'anonymous accepted'; exception when insufficient_privilege then null; end;
 begin perform count(*) from public.cat_days_notes; raise exception 'anonymous read accepted'; exception when insufficient_privilege then null; end;
end$$;
reset role;
\echo 'PASS: RLS, single-account restriction, CAS, replay, import, delete purge, pagination and UTF-16 limits'
