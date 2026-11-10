create table if not exists public.sofia_financial_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  constraint sofia_state_is_object check (jsonb_typeof(data) = 'object')
);
alter table public.sofia_financial_state enable row level security;
revoke all on public.sofia_financial_state from anon;
grant select, insert, update, delete on public.sofia_financial_state to authenticated;
create policy "sofia_select_own" on public.sofia_financial_state
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "sofia_insert_own" on public.sofia_financial_state
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "sofia_update_own" on public.sofia_financial_state
  for update to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "sofia_delete_own" on public.sofia_financial_state
  for delete to authenticated using ((select auth.uid()) = user_id);
