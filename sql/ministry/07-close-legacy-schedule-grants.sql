begin;

-- Apply after the deployed frontend uses the session-checked RPC.
alter table public.surveys enable row level security;
alter table public.survey_responses enable row level security;
alter table public.rsvp_responses enable row level security;
alter table public.mission_baggage enable row level security;
revoke all on public.surveys, public.survey_responses, public.rsvp_responses, public.mission_baggage from public, anon, authenticated;

-- Older browsers read limited roster columns directly. The admin RPC now owns that read.
revoke select(id,generation,name,team,created_at) on public.users from public, anon, authenticated;

notify pgrst, 'reload schema';
commit;
