begin;

alter table mission_private.polls
  add column if not exists minutes integer check (minutes between 30 and 240 and minutes % 30 = 0),
  add column if not exists description text not null default '',
  add column if not exists deadline timestamptz,
  add column if not exists lifecycle text check (lifecycle in ('cancelled', 'archived')),
  add column if not exists memo text not null default '',
  add column if not exists meal_provided boolean not null default false,
  add column if not exists version integer not null default 0,
  add column if not exists notice_version integer not null default 0,
  add column if not exists updated_at timestamptz not null default now();

alter table mission_private.votes
  add column if not exists memo text not null default '',
  add column if not exists half_hour_vote boolean not null default false;

create table if not exists mission_private.attendance (
  poll uuid not null references mission_private.polls on delete cascade,
  person uuid not null references public.users,
  status text not null check (status in ('참석', '부분참석', '불참')),
  reason text not null,
  arrival text not null,
  meal boolean not null,
  primary key (poll, person)
);

create table if not exists mission_private.schedule_admins (
  person uuid primary key references public.users
);
revoke all on mission_private.attendance, mission_private.schedule_admins from public, anon, authenticated;
alter table mission_private.attendance enable row level security;
alter table mission_private.schedule_admins enable row level security;

-- Match the existing administrator account. Abort on missing or ambiguous identity.
do $$
declare admin_id uuid;
begin
  select id into strict admin_id from public.users where generation::text = '45' and name = '강수혁';
  insert into mission_private.schedule_admins values (admin_id) on conflict do nothing;
end $$;

-- Expand legacy one-hour choices for display without changing the original rows.
create or replace function mission_private.half_hours(original text[], legacy boolean)
returns text[] language sql immutable set search_path = '' as $$
  select coalesce(array_agg(distinct slot order by slot), '{}'::text[])
  from (
    select unnest(original) as slot
    union all
    select to_char(slot::timestamp + interval '30 minutes', 'YYYY-MM-DD"T"HH24:MI')
    from unnest(original) as slot where legacy
  ) as expanded
$$;
revoke all on function mission_private.half_hours(text[],boolean) from public, anon, authenticated;

create or replace function mission_private.live_schedule(token text, operation text, payload jsonb, admin_view boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  uid uuid;
  target mission_private.polls%rowtype;
  target_id uuid;
  team_name text;
  member_role text;
  manager boolean;
  all_slots text[];
  selected text[];
  duration integer;
  cutoff timestamptz;
  title_text text;
  description_text text;
  status_text text;
  reason_text text;
  arrival_text text;
  meal_flag boolean;
  chosen text;
  notice_text text;
  place_text text;
  visible_teams jsonb;
  visible_meetings jsonb;
begin
  select person into uid from mission_private.sessions
  where digest = sha256(convert_to(token, 'UTF8')) and expires_at > now();
  if uid is null then return '{"expired":true}'::jsonb; end if;
  admin_view := coalesce(admin_view, false);
  if admin_view and not exists (select from mission_private.schedule_admins where person = uid) then
    raise exception '사역팀 현황은 관리자 계정으로 로그인해 주세요.';
  end if;

  if operation <> 'read' then
    if operation = 'create' then
      team_name := payload->>'team';
    else
      target_id := (payload->>'id')::uuid;
      select * into target from mission_private.polls where id = target_id for update;
      if not found then raise exception '일정을 찾을 수 없습니다.'; end if;
      team_name := target.team;
    end if;
    select role into member_role from mission_private.members where person = uid and team = team_name;
    manager := admin_view or coalesce(member_role in ('팀장', '담당자'), false);
    if not admin_view and member_role is null then raise exception '이 팀의 구성원이 아닙니다.'; end if;
    if operation not in ('vote', 'rsvp') and not manager then
      raise exception '팀장 또는 담당자만 일정을 관리할 수 있습니다.';
    end if;
    if operation <> 'create' and (payload->>'version')::integer is distinct from target.version then
      raise exception '일정이나 응답이 변경되었습니다. 새로고침 후 다시 시도해 주세요.';
    end if;
    if target.lifecycle = 'archived' then raise exception '보관된 일정입니다.'; end if;
    if target.lifecycle = 'cancelled' and operation <> 'archive' then raise exception '취소된 일정입니다.'; end if;

    if operation in ('create', 'editCandidates', 'vote') then
      if jsonb_typeof(payload->'slots') is distinct from 'array' or jsonb_array_length(payload->'slots') > 500 then
        raise exception '후보 시간을 확인해 주세요.';
      end if;
      select array(select distinct value from jsonb_array_elements_text(payload->'slots') order by value) into selected;
      if exists (select from unnest(selected) as s where s is null or
        s !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T([01][0-9]|2[0-3]):(00|30)$'
        or to_char(s::timestamp, 'YYYY-MM-DD"T"HH24:MI') <> s) then
        raise exception '30분 단위의 유효한 날짜와 시간을 선택해 주세요.';
      end if;
    end if;

    if operation in ('create', 'editCandidates') then
      if target.confirmed is not null then raise exception '확정된 일정입니다.'; end if;
      duration := (payload->>'minutes')::integer;
      cutoff := (payload->>'deadline')::timestamptz;
      title_text := btrim(coalesce(payload->>'title',''));
      description_text := btrim(coalesce(payload->>'description',''));
      if duration is null or duration not between 30 and 240 or duration % 30 <> 0
        or cutoff is null or not isfinite(cutoff) or cutoff <= now()
        or length(title_text) not between 1 and 120 or length(description_text) > 2000 then
        raise exception '제목, 모임 시간, 마감 시간을 확인해 주세요.';
      end if;
      if not exists (select from unnest(selected) as s where not exists (
        select from generate_series(0, duration / 30 - 1) as step
        where not (to_char(s::timestamp + step * interval '30 minutes','YYYY-MM-DD"T"HH24:MI') = any(selected))
      )) then raise exception '모임 시간만큼 연속되는 후보가 필요합니다.'; end if;
      if operation = 'create' then
        insert into mission_private.polls(id, team, title, slots, hours, minutes, deadline, description)
        values (gen_random_uuid(), team_name, title_text, selected, (duration+59)/60, duration, cutoff, description_text);
      else
        update mission_private.polls set title = title_text, slots = selected, minutes = duration,
          hours = (duration+59)/60, deadline = cutoff, description = description_text where id = target_id;
        delete from mission_private.votes where poll = target_id;
      end if;
    elsif operation = 'vote' then
      if member_role is null or admin_view or target.confirmed is not null
        or coalesce(target.deadline <= now(), false) then raise exception '현재 투표할 수 없습니다.'; end if;
      all_slots := mission_private.half_hours(target.slots, target.minutes is null);
      if not (selected <@ all_slots) then raise exception '후보에 없는 시간입니다.'; end if;
      notice_text := btrim(coalesce(payload->>'memo', ''));
      if length(notice_text) > 2000 then raise exception '전달사항이 너무 깁니다.'; end if;
      insert into mission_private.votes(poll,person,slots,memo,half_hour_vote) values (target_id,uid,selected,notice_text,true)
      on conflict(poll,person) do update set slots = excluded.slots, memo = excluded.memo, half_hour_vote = true;
    elsif operation in ('confirm', 'editNotice') then
      if (operation = 'confirm') <> (target.confirmed is null) then raise exception '일정 상태가 변경되었습니다.'; end if;
      chosen := payload->>'confirmed';
      if chosen is null or chosen !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T([01][0-9]|2[0-3]):[0-5][0-9]$'
        or to_char(chosen::timestamp,'YYYY-MM-DD"T"HH24:MI') <> chosen then
        raise exception '확정 시간을 확인해 주세요.';
      end if;
      if operation = 'confirm' then
        all_slots := mission_private.half_hours(target.slots, target.minutes is null);
        if exists (select from generate_series(0, coalesce(target.minutes,target.hours*60)/30-1) as step
          where not (to_char(chosen::timestamp + step*interval '30 minutes','YYYY-MM-DD"T"HH24:MI') = any(all_slots))) then
          raise exception '후보 시간을 선택해 주세요.';
        end if;
      end if;
      place_text := coalesce(nullif(btrim(payload->>'place'),''),'미정(추후 공지 예정)');
      notice_text := btrim(coalesce(payload->>'memo',''));
      meal_flag := coalesce(payload->'mealProvided' = 'true'::jsonb, false);
      if length(place_text) > 160 or length(notice_text) > 2000 then raise exception '공지 내용을 줄여 주세요.'; end if;
      if target.confirmed is distinct from chosen or target.meal_provided is distinct from meal_flag then
        delete from mission_private.attendance where poll = target_id;
      end if;
      update mission_private.polls set confirmed = chosen, place = place_text, memo = notice_text,
        meal_provided = meal_flag, notice_version = greatest(notice_version, case when operation = 'editNotice' then 1 else 0 end) + 1
      where id = target_id;
    elsif operation = 'rsvp' then
      if member_role is null or admin_view or target.confirmed is null then raise exception '참석 체크할 수 없습니다.'; end if;
      status_text := payload->>'status';
      if status_text is null or status_text not in ('참석','부분참석','불참') then raise exception '참석 여부를 선택해 주세요.'; end if;
      reason_text := case when status_text = '참석' then '' else btrim(coalesce(payload->>'reason','')) end;
      arrival_text := case when status_text = '부분참석' then coalesce(payload->>'arrival','') else '' end;
      if status_text <> '참석' and length(reason_text) not between 1 and 2000 then raise exception '사유를 적어 주세요.'; end if;
      if status_text = '부분참석' and arrival_text !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then raise exception '참석 시작 시간을 입력해 주세요.'; end if;
      if target.meal_provided and status_text <> '불참' and jsonb_typeof(payload->'meal') is distinct from 'boolean' then
        raise exception '식사 여부를 선택해 주세요.';
      end if;
      meal_flag := target.meal_provided and status_text <> '불참' and coalesce(payload->'meal' = 'true'::jsonb,false);
      insert into mission_private.attendance values (target_id,uid,status_text,reason_text,arrival_text,meal_flag)
      on conflict(poll,person) do update set status = excluded.status, reason = excluded.reason, arrival = excluded.arrival, meal = excluded.meal;
    elsif operation in ('close','reopen') then
      if target.confirmed is not null then raise exception '확정된 일정입니다.'; end if;
      cutoff := now();
      if operation = 'reopen' then
        cutoff := (payload->>'deadline')::timestamptz;
        if cutoff is null or not isfinite(cutoff) or cutoff <= now() then raise exception '새 마감 시간을 선택해 주세요.'; end if;
      end if;
      update mission_private.polls set deadline = cutoff where id = target_id;
    elsif operation in ('cancel','archive') then
      update mission_private.polls set lifecycle = case when operation = 'cancel' then 'cancelled' else 'archived' end where id = target_id;
    else raise exception '지원하지 않는 작업입니다.';
    end if;
    if target_id is not null then
      update mission_private.polls set version = version + 1, updated_at = now() where id = target_id;
    end if;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('id', t.team, 'name', t.team, 'area', t.ministry,
    'people', coalesce((select jsonb_agg(jsonb_build_object('id', m.person, 'name', u.name, 'role', m.role) order by u.name)
      from mission_private.members m join public.users u on u.id = m.person where m.team = t.team), '[]'::jsonb))
    order by t.ministry,t.team), '[]'::jsonb) into visible_teams
  from mission_private.teams t
  where admin_view or exists (select from mission_private.members m where m.team = t.team and m.person = uid);

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', p.id, 'team', p.team, 'title', p.title, 'description', p.description,
    'slots', mission_private.half_hours(p.slots, p.minutes is null), 'minutes', coalesce(p.minutes,p.hours*60),
    'deadline', p.deadline, 'status', coalesce(p.lifecycle,case when p.confirmed is null then 'voting' else 'confirmed' end),
    'confirmed', coalesce(p.confirmed,''), 'place', coalesce(p.place,''), 'memo', p.memo, 'mealProvided',p.meal_provided,
    'version',p.version,'noticeVersion',p.notice_version,'updatedAt',p.updated_at,
    'responseCount',(select count(*) from mission_private.votes v join mission_private.members m on m.team=p.team and m.person=v.person where v.poll=p.id),
    'votes',coalesce((select jsonb_object_agg(v.person,jsonb_build_object(
      'slots',mission_private.half_hours(v.slots,p.minutes is null and not v.half_hour_vote),'memo',v.memo))
      from mission_private.votes v join mission_private.members m on m.team=p.team and m.person=v.person
      where v.poll=p.id and (access.full_access or v.person=uid)),'{}'::jsonb),
    'rsvps',coalesce((select jsonb_object_agg(a.person,jsonb_build_object('status',a.status,'reason',a.reason,'arrival',a.arrival,'meal',a.meal))
      from mission_private.attendance a join mission_private.members m on m.team=p.team and m.person=a.person
      where a.poll=p.id and (access.full_access or a.person=uid)),'{}'::jsonb)
    ) order by p.created_at desc), '[]'::jsonb) into visible_meetings
  from mission_private.polls p
  left join mission_private.members own on own.team=p.team and own.person=uid
  cross join lateral (select admin_view or coalesce(own.role in ('팀장','담당자'),false) as full_access) access
  where admin_view or own.person is not null;
  return jsonb_build_object('actor',uid,'teams',visible_teams,'meetings',visible_meetings);
end $$;

create or replace function public.mission_schedule(token text, operation text, payload jsonb, admin_view boolean)
returns jsonb language sql security invoker set search_path = '' as $$
  select mission_private.live_schedule(token, operation, payload, admin_view)
$$;
revoke all on function mission_private.live_schedule(text,text,jsonb,boolean),
  public.mission_schedule(text,text,jsonb,boolean) from public;
grant execute on function mission_private.live_schedule(text,text,jsonb,boolean),
  public.mission_schedule(text,text,jsonb,boolean) to anon, authenticated;

create or replace function mission_private.team_action(token text, operation text, payload jsonb) returns jsonb
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
      from mission_private.polls s where s.team=t.team and s.minutes is null and s.version=0),'[]'::jsonb)) order by t.ministry,t.team)
     from mission_private.teams t join mission_private.members m on m.team=t.team where m.person=uid),'[]'::jsonb));
 end if;
 pid:=(payload->>'id')::uuid;
 if operation='create' then tid:=payload->>'team'; else
   select * into meeting from mission_private.polls where id=pid for update; tid:=meeting.team;
   if meeting.minutes is not null or meeting.version<>0 then
     raise exception '이 일정은 새 사역 일정 화면에서 관리해 주세요.';
   end if;
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

notify pgrst, 'reload schema';
commit;
