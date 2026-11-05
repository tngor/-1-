grant usage on schema mission_private to anon, authenticated;
create table mission_private.sessions (
  digest bytea primary key, person uuid not null references public.users,
  expires_at timestamptz not null default now()+interval '14 days'
);
create table mission_private.login_attempts (
  person uuid primary key references public.users, failures integer not null, since timestamptz not null
);
create table mission_private.polls (
  id uuid primary key, team text not null references mission_private.teams,
  title text not null check(length(title) between 1 and 120), slots text[] not null,
  hours integer not null check(hours between 1 and 4),
  confirmed text, place text, created_at timestamptz not null default now()
);
create index polls_by_team on mission_private.polls(team,created_at);
create table mission_private.votes (
  poll uuid not null references mission_private.polls, person uuid not null references public.users,
  slots text[] not null, primary key(poll,person)
);
revoke all on all tables in schema mission_private from public, anon, authenticated;

create function mission_private.login(g text,n text,p text,signup boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u public.users%rowtype; a mission_private.login_attempts%rowtype; secret text;
begin
 if g is null or g !~ '^[0-9]{1,3}$' or coalesce(length(btrim(n)),0) not between 1 and 40 or p is null or p !~ '^[0-9]{4}$' then return jsonb_build_object('error','입력한 정보를 확인해 주세요.'); end if;
 perform pg_advisory_xact_lock(hashtextextended(g||':'||n,0));
 select * into u from public.users where generation=g and name=n;
 if not found then
   if signup is not true then return '{"missing":true}'::jsonb; end if;
   insert into public.users(generation,name,pin,team) values(g,n,p,'전체') returning * into u;
 end if;
 select * into a from mission_private.login_attempts where person=u.id;
 if a.since> now()-interval '10 minutes' and a.failures>=8 then return jsonb_build_object('error','잠시 후 다시 시도해 주세요.'); end if;
 if u.pin is distinct from p then
   insert into mission_private.login_attempts values(u.id,1,now())
   on conflict(person) do update set failures=case when login_attempts.since>now()-interval '10 minutes' then login_attempts.failures+1 else 1 end,
   since=case when login_attempts.since>now()-interval '10 minutes' then login_attempts.since else now() end;
   return jsonb_build_object('error','비밀번호를 확인해 주세요.');
 end if;
 delete from mission_private.login_attempts where person=u.id;
 delete from mission_private.sessions where expires_at < now();
 secret:=gen_random_uuid()::text||gen_random_uuid()::text;
 insert into mission_private.sessions(digest,person) values(sha256(convert_to(secret,'UTF8')),u.id);
 return jsonb_build_object('session',secret);
end $$;

create function mission_private.team_action(token text, operation text, payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare uid uuid; meeting mission_private.polls%rowtype; selected text[]; tid text; pid uuid; role_name text; duration integer; start_slot text; vname text;
begin
 select person into uid from mission_private.sessions where digest=sha256(convert_to(token,'UTF8')) and expires_at>now();
 if uid is null then return '{"expired":true}'::jsonb; end if;
 if operation='logout' then
   delete from mission_private.sessions where digest=sha256(convert_to(token,'UTF8'));
   return '{}'::jsonb;
 end if;
 select name into vname from public.users where id=uid;
 if operation='read' then
   return jsonb_build_object('name',vname,'teams',coalesce((
    select jsonb_agg(jsonb_build_object('name',t.team,'area',t.ministry,'role',m.role,
    'people',(select jsonb_agg(jsonb_build_object('name',u.name,'role',r.role) order by u.name) from mission_private.members r join public.users u on u.id=r.person where r.team=t.team),
    'polls',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'team',s.team,'title',s.title,'hours',s.hours,'slots',s.slots,'confirmed',s.confirmed,'place',s.place,
      'votes',coalesce((select jsonb_object_agg(u.name,v.slots) from mission_private.votes v join public.users u on u.id=v.person where v.poll=s.id and (m.role='팀장' or v.person=uid)),'{}'::jsonb)) order by s.created_at desc)
      from mission_private.polls s where s.team=t.team),'[]'::jsonb)) order by t.ministry,t.team)
     from mission_private.teams t join mission_private.members m on m.team=t.team where m.person=uid),'[]'::jsonb));
 end if;
 pid:=(payload->>'id')::uuid;
 if operation='create' then tid:=payload->>'team'; else
   select * into meeting from mission_private.polls where id=pid for update; tid:=meeting.team;
 end if;
 select role into role_name from mission_private.members where person=uid and team=tid;
 if role_name is null or (operation in ('create','confirm') and role_name<>'팀장') then raise exception '이 팀에서 실행할 권한이 없습니다.'; end if;
 if operation='create' then
   duration:=(payload->>'hours')::integer;
   select array_agg(distinct x order by x) into selected from jsonb_array_elements_text(payload->'slots') x;
   if coalesce(cardinality(selected),0) not between 1 and 500 or duration is null or duration not between 1 and 4 or exists(select from unnest(selected) s where s is null or s !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T([01][0-9]|2[0-3]):00$' or to_char(s::timestamp,'YYYY-MM-DD"T"HH24:MI')<>s) then raise exception '후보 날짜와 시간을 확인해 주세요.'; end if;
   if not exists(select from unnest(selected) s where not exists(select from generate_series(0,duration-1) h where not(to_char(s::timestamp+h*interval '1 hour','YYYY-MM-DD"T"HH24:MI')=any(selected)))) then raise exception '모임 시간만큼 이어지는 후보가 필요합니다.'; end if;
   insert into mission_private.polls(id,team,title,slots,hours) values(pid,tid,btrim(payload->>'title'),selected,duration);
 elsif meeting.confirmed is not null then raise exception '이미 확정된 모임입니다.';
 elsif operation='vote' then
   if jsonb_typeof(payload->'slots') is distinct from 'array' then raise exception '응답을 확인해 주세요.'; end if;
   selected:=array(select distinct x from jsonb_array_elements_text(payload->'slots') x);
   if not(selected <@ meeting.slots) then raise exception '후보에 없는 시간입니다.'; end if;
   insert into mission_private.votes values(pid,uid,selected) on conflict(poll,person) do update set slots=excluded.slots;
 elsif operation='confirm' then
   start_slot:=payload->>'confirmed';
   if start_slot is null or not(start_slot=any(meeting.slots)) or exists(select from generate_series(0,meeting.hours-1) h where not(to_char(start_slot::timestamp+h*interval '1 hour','YYYY-MM-DD"T"HH24:MI')=any(meeting.slots))) then raise exception '확정 시간을 확인해 주세요.'; end if;
   update mission_private.polls set confirmed=start_slot,place=left(coalesce(nullif(btrim(payload->>'place'),''),'미정(추후 공지 예정)'),160) where id=pid;
 else raise exception '지원하지 않는 작업입니다.'; end if;
 return '{"ok":true}'::jsonb;
end $$;

create function public.mission_login(g text,n text,p text,signup boolean) returns jsonb
language sql security invoker set search_path='' as $$ select mission_private.login(g,n,p,signup) $$;
create function public.mission_action(token text,operation text,payload jsonb) returns jsonb
language sql security invoker set search_path='' as $$ select mission_private.team_action(token,operation,payload) $$;
revoke all on function mission_private.login(text,text,text,boolean),mission_private.team_action(text,text,jsonb),public.mission_login(text,text,text,boolean),public.mission_action(text,text,jsonb) from public;
grant execute on function mission_private.login(text,text,text,boolean),mission_private.team_action(text,text,jsonb),public.mission_login(text,text,text,boolean),public.mission_action(text,text,jsonb) to anon,authenticated;
notify pgrst, 'reload schema';
