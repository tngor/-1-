-- Apply at cutover, once clients use the server login path. Old open clients may need to reload.
revoke all privileges on public.users from public, anon, authenticated;
grant select(id,generation,name,team,created_at) on public.users to anon, authenticated;
