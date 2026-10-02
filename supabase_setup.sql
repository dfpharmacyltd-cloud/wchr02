-- West-Coast Recruitment Mailer: shared database
-- Run once in Supabase → SQL Editor → New query → paste everything → Run.

create table if not exists public.wc_kv (
  key text primary key,
  value jsonb,
  updated_at timestamptz not null default now()
);
create table if not exists public.wc_candidates (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
create table if not exists public.wc_email_log (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
create table if not exists public.wc_sender_lock (
  id int primary key default 1,
  owner text,
  label text,
  until timestamptz
);
create index if not exists wc_kv_updated on public.wc_kv (updated_at);
create index if not exists wc_candidates_updated on public.wc_candidates (updated_at);
create index if not exists wc_email_log_updated on public.wc_email_log (updated_at);

-- Every change gets the database's own clock, so all computers agree on what is new
create or replace function public.wc_touch() returns trigger language plpgsql as $$
begin new.updated_at := clock_timestamp(); return new; end $$;
drop trigger if exists wc_kv_touch on public.wc_kv;
create trigger wc_kv_touch before insert or update on public.wc_kv for each row execute function public.wc_touch();
drop trigger if exists wc_candidates_touch on public.wc_candidates;
create trigger wc_candidates_touch before insert or update on public.wc_candidates for each row execute function public.wc_touch();
drop trigger if exists wc_email_log_touch on public.wc_email_log;
create trigger wc_email_log_touch before insert or update on public.wc_email_log for each row execute function public.wc_touch();

-- Only signed-in HR users can read or change anything. Nobody else, even with the public key.
alter table public.wc_kv enable row level security;
alter table public.wc_candidates enable row level security;
alter table public.wc_email_log enable row level security;
alter table public.wc_sender_lock enable row level security;
drop policy if exists wc_kv_hr on public.wc_kv;
create policy wc_kv_hr on public.wc_kv for all to authenticated using (true) with check (true);
drop policy if exists wc_candidates_hr on public.wc_candidates;
create policy wc_candidates_hr on public.wc_candidates for all to authenticated using (true) with check (true);
drop policy if exists wc_email_log_hr on public.wc_email_log;
create policy wc_email_log_hr on public.wc_email_log for all to authenticated using (true) with check (true);
drop policy if exists wc_sender_lock_read on public.wc_sender_lock;
create policy wc_sender_lock_read on public.wc_sender_lock for select to authenticated using (true);

-- Only one computer sends emails at a time. It renews its claim every 30 s; a claim expires after 2 min.
create or replace function public.wc_claim_sender(p_owner text, p_label text, p_ttl_seconds int default 120)
returns table(owner text, label text, until timestamptz)
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  insert into wc_sender_lock as l (id, owner, label, until)
    values (1, p_owner, p_label, now() + make_interval(secs => p_ttl_seconds))
  on conflict (id) do update set owner = excluded.owner, label = excluded.label, until = excluded.until
    where l.owner = excluded.owner or l.until < now();
  return query select l.owner, l.label, l.until from wc_sender_lock l where l.id = 1;
end $$;

create or replace function public.wc_take_sender(p_owner text, p_label text, p_ttl_seconds int default 120)
returns table(owner text, label text, until timestamptz)
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  insert into wc_sender_lock as l (id, owner, label, until)
    values (1, p_owner, p_label, now() + make_interval(secs => p_ttl_seconds))
  on conflict (id) do update set owner = excluded.owner, label = excluded.label, until = excluded.until;
  return query select l.owner, l.label, l.until from wc_sender_lock l where l.id = 1;
end $$;

revoke all on function public.wc_claim_sender(text, text, int) from public, anon;
revoke all on function public.wc_take_sender(text, text, int) from public, anon;
grant execute on function public.wc_claim_sender(text, text, int) to authenticated;
grant execute on function public.wc_take_sender(text, text, int) to authenticated;
