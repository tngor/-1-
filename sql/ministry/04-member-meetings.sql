begin;

alter table mission_private.polls
  add column created_by uuid references public.users,
  add column ends_at text,
  add column notice_edited_at timestamptz,
  add column needs_recheck boolean not null default false;

-- Earlier releases did not record authors. Preserve their dates and responses.
update mission_private.polls
set ends_at = to_char(confirmed::timestamp + coalesce(minutes,hours*60)*interval '1 minute','YYYY-MM-DD"T"HH24:MI')
where confirmed is not null;

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
  ends text;
  reset_responses boolean;
  is_admin boolean;
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
  select exists (select from mission_private.schedule_admins where person = uid) into is_admin;
  if admin_view and not is_admin then
    raise exception '사역팀 현황은 관리자 계정으로 로그인해 주세요.';
  end if;

  if operation <> 'read' then
    if operation in ('create','createNotice') then
      team_name := payload->>'team';
    else
      target_id := (payload->>'id')::uuid;
      select * into target from mission_private.polls where id = target_id for update;
      if not found then raise exception '일정을 찾을 수 없습니다.'; end if;
      team_name := target.team;
    end if;
    select role into member_role from mission_private.members where person = uid and team = team_name;
    manager := is_admin or coalesce(target.created_by = uid, false);
    if not admin_view and member_role is null then raise exception '이 팀의 구성원이 아닙니다.'; end if;
    if operation not in ('create', 'createNotice', 'vote', 'rsvp') and not manager then
      raise exception '작성자와 강수혁만 이 일정을 관리할 수 있습니다.';
    end if;
    if operation not in ('create','createNotice') and (payload->>'version')::integer is distinct from target.version then
      raise exception '일정이나 응답이 변경되었습니다. 새로고침 후 다시 시도해 주세요.';
    end if;
    if target.lifecycle = 'archived' and operation <> 'delete' then raise exception '보관된 일정입니다.'; end if;
    if target.lifecycle = 'cancelled' and operation not in ('archive','delete') then raise exception '취소된 일정입니다.'; end if;

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
      title_text := btrim(coalesce(payload->>'title',''));
      description_text := btrim(coalesce(payload->>'description',''));
      if duration is null or duration not between 30 and 240 or duration % 30 <> 0
        or length(title_text) not between 1 and 120 or length(description_text) > 2000 then
        raise exception '제목과 모임 시간을 확인해 주세요.';
      end if;
      if not exists (select from unnest(selected) as s where not exists (
        select from generate_series(0, duration / 30 - 1) as step
        where not (to_char(s::timestamp + step * interval '30 minutes','YYYY-MM-DD"T"HH24:MI') = any(selected))
      )) then raise exception '모임 시간만큼 연속되는 후보가 필요합니다.'; end if;
      if operation = 'create' then
        insert into mission_private.polls(id, team, title, slots, hours, minutes, created_by, description)
        values (gen_random_uuid(), team_name, title_text, selected, (duration+59)/60, duration, uid, description_text);
      else
        update mission_private.polls set title = title_text, slots = selected, minutes = duration,
          hours = (duration+59)/60, description = description_text where id = target_id;
        delete from mission_private.votes where poll = target_id;
      end if;
    elsif operation = 'vote' then
      if member_role is null or admin_view or target.confirmed is not null then raise exception '현재 투표할 수 없습니다.'; end if;
      all_slots := mission_private.half_hours(target.slots, target.minutes is null);
      if not (selected <@ all_slots) then raise exception '후보에 없는 시간입니다.'; end if;
      notice_text := btrim(coalesce(payload->>'memo', ''));
      if length(notice_text) > 2000 then raise exception '전달사항이 너무 깁니다.'; end if;
      insert into mission_private.votes(poll,person,slots,memo,half_hour_vote) values (target_id,uid,selected,notice_text,true)
      on conflict(poll,person) do update set slots = excluded.slots, memo = excluded.memo, half_hour_vote = true;
    elsif operation in ('createNotice', 'confirm', 'editNotice') then
      if operation <> 'createNotice' and (operation = 'confirm') <> (target.confirmed is null) then raise exception '일정 상태가 변경되었습니다.'; end if;
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
      if operation = 'confirm' then
        ends := to_char(chosen::timestamp + coalesce(target.minutes,target.hours*60) * interval '1 minute','YYYY-MM-DD"T"HH24:MI');
      elsif operation = 'editNotice' and not (payload ? 'endsAt') then
        -- An already-open older client only sends the start. Preserve its duration.
        ends := to_char(chosen::timestamp + (target.ends_at::timestamp - target.confirmed::timestamp),'YYYY-MM-DD"T"HH24:MI');
      else
        ends := nullif(payload->>'endsAt','');
        if ends is not null and (ends !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T([01][0-9]|2[0-3]):[0-5][0-9]$'
          or to_char(ends::timestamp,'YYYY-MM-DD"T"HH24:MI') <> ends or ends <= chosen) then
          raise exception '종료 시간은 시작 시간 이후로 입력해 주세요.';
        end if;
      end if;
      if operation = 'createNotice' then
        title_text := btrim(coalesce(payload->>'title',''));
        if length(title_text) not between 1 and 120 then raise exception '모임 제목을 입력해 주세요.'; end if;
        insert into mission_private.polls(id,team,title,created_by,slots,hours,confirmed,ends_at,place,memo,meal_provided,notice_version)
        values(gen_random_uuid(),team_name,title_text,uid,'{}',1,chosen,ends,place_text,notice_text,meal_flag,1);
      else
        reset_responses := operation = 'editNotice' and
          (target.confirmed <> chosen or target.ends_at is distinct from ends or target.meal_provided <> meal_flag);
        if reset_responses then delete from mission_private.attendance where poll = target_id; end if;
        update mission_private.polls set confirmed = chosen, ends_at = ends, place = place_text, memo = notice_text,
          meal_provided = meal_flag, notice_version = greatest(notice_version, case when operation = 'editNotice' then 1 else 0 end) + 1,
          notice_edited_at = case when operation = 'editNotice' then now() end,
          needs_recheck = needs_recheck or reset_responses
        where id = target_id;
      end if;
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
    elsif operation = 'delete' then
      if target.lifecycle is null or target.lifecycle not in ('cancelled','archived') then
        raise exception '취소하거나 보관한 모임만 삭제할 수 있습니다.';
      end if;
      delete from mission_private.votes where poll = target_id;
      delete from mission_private.polls where id = target_id;
    elsif operation in ('cancel','archive') then
      update mission_private.polls set lifecycle = case when operation = 'cancel' then 'cancelled' else 'archived' end where id = target_id;
    else raise exception '지원하지 않는 작업입니다.';
    end if;
    if target_id is not null then
      update mission_private.polls set version = version + 1, updated_at = now() where id = target_id;
    end if;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('id', t.team, 'name', t.team, 'area', t.ministry,
    'people', coalesce((select jsonb_agg(jsonb_build_object('id', m.person, 'name', u.name) order by u.name)
      from mission_private.members m join public.users u on u.id = m.person where m.team = t.team), '[]'::jsonb))
    order by t.ministry,t.team), '[]'::jsonb) into visible_teams
  from mission_private.teams t
  where admin_view or exists (select from mission_private.members m where m.team = t.team and m.person = uid);

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', p.id, 'team', p.team, 'title', p.title, 'description', p.description,
    'slots', mission_private.half_hours(p.slots, p.minutes is null), 'minutes', coalesce(p.minutes,p.hours*60),
    'createdBy', author.name, 'canManage', access.full_access, 'endsAt',p.ends_at,
    'needsRecheck', p.needs_recheck, 'noticeEditedAt',p.notice_edited_at, 'status', coalesce(p.lifecycle,case when p.confirmed is null then 'voting' else 'confirmed' end),
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
  left join public.users author on author.id=p.created_by
  left join mission_private.members own on own.team=p.team and own.person=uid
  cross join lateral (select is_admin or coalesce(p.created_by = uid,false) as full_access) access
  where admin_view or own.person is not null;
  return jsonb_build_object('actor',uid,'teams',visible_teams,'meetings',visible_meetings);
end $$;

create or replace function mission_private.team_action(token text, operation text, payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare uid uuid;
begin
  select person into uid from mission_private.sessions where digest=sha256(convert_to(token,'UTF8')) and expires_at>now();
  if uid is null then return '{"expired":true}'::jsonb; end if;
  if operation='logout' then
    delete from mission_private.sessions where digest=sha256(convert_to(token,'UTF8'));
    return '{}'::jsonb;
  elsif operation='session' then
    update mission_private.sessions set expires_at=now()+interval '14 days'
      where digest=sha256(convert_to(token,'UTF8')) and expires_at>now();
    if not found then return '{"expired":true}'::jsonb; end if;
    return (select jsonb_build_object('name',name,'generation',generation::text) from public.users where id=uid);
  elsif operation='read' then
    return mission_private.live_schedule(token,'read','{}',false);
  end if;
  raise exception '새로고침 후 사역 일정 화면을 이용해 주세요.';
end $$;

notify pgrst, 'reload schema';
commit;
