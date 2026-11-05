create schema mission_private;
revoke all on schema mission_private from public;


create table mission_private.teams (
  team text primary key,
  ministry text not null
);
create table mission_private.members (
  team text references mission_private.teams not null,
  person uuid references public.users not null,
  role text not null check (role in ('팀원','담당자','팀장')),
  primary key (team,person)
);
create unique index one_ministry_leader on mission_private.members(team) where role='팀장';
create index membership_by_person on mission_private.members(person,team);

revoke all on all tables in schema mission_private from public, anon, authenticated;
