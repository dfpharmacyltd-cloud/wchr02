-- West-Coast Recruitment Mailer: separate data for every HR user, Admin sees everything.
-- Run ONCE in Supabase → SQL Editor → New query → paste everything → Run.
-- Safe to run again.

-- 1) Who is Admin: users whose app_metadata.role = 'admin' (set only by the server / this script)
create or replace function public.wc_is_admin() returns boolean language sql stable as $$
  select coalesce((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin', false)
$$;

-- 2) Every candidate and every email/WhatsApp row belongs to the user who created it
alter table public.wc_candidates add column if not exists owner uuid default auth.uid();
alter table public.wc_email_log  add column if not exists owner uuid default auth.uid();
alter table public.wc_kv         add column if not exists owner uuid;           -- empty = shared company setting
create index if not exists wc_candidates_owner on public.wc_candidates (owner);
create index if not exists wc_email_log_owner  on public.wc_email_log (owner);

-- 3) HR Mail Desk mails (CV inbox) in the shared database, per user
create table if not exists public.wc_mail (
  id text primary key,
  owner uuid not null default auth.uid(),
  data jsonb not null,
  updated_at timestamptz not null default now()
);
create index if not exists wc_mail_updated on public.wc_mail (updated_at);
create index if not exists wc_mail_owner on public.wc_mail (owner);
drop trigger if exists wc_mail_touch on public.wc_mail;
create trigger wc_mail_touch before insert or update on public.wc_mail for each row execute function public.wc_touch();

-- 4) Row-level security: a user sees only their own rows; Admin sees all
alter table public.wc_mail enable row level security;
drop policy if exists wc_candidates_hr on public.wc_candidates;
drop policy if exists wc_candidates_own on public.wc_candidates;
create policy wc_candidates_own on public.wc_candidates for all to authenticated
  using (owner = auth.uid() or public.wc_is_admin()) with check (owner = auth.uid() or public.wc_is_admin());
drop policy if exists wc_email_log_hr on public.wc_email_log;
drop policy if exists wc_email_log_own on public.wc_email_log;
create policy wc_email_log_own on public.wc_email_log for all to authenticated
  using (owner = auth.uid() or public.wc_is_admin()) with check (owner = auth.uid() or public.wc_is_admin());
drop policy if exists wc_mail_own on public.wc_mail;
create policy wc_mail_own on public.wc_mail for all to authenticated
  using (owner = auth.uid() or public.wc_is_admin()) with check (owner = auth.uid() or public.wc_is_admin());
drop policy if exists wc_kv_hr on public.wc_kv;
drop policy if exists wc_kv_own on public.wc_kv;
create policy wc_kv_own on public.wc_kv for all to authenticated
  using (owner is null or owner = auth.uid() or public.wc_is_admin())
  with check (owner is null or owner = auth.uid() or public.wc_is_admin());
grant select, insert, update, delete on public.wc_mail to authenticated;

-- 5) Each user sends from their own computer + Outlook: one sending lock per user
create table if not exists public.wc_sender_lock_u (
  uid uuid primary key default auth.uid(),
  owner text, label text, until timestamptz
);
alter table public.wc_sender_lock_u enable row level security;
drop policy if exists wc_sender_lock_u_read on public.wc_sender_lock_u;
create policy wc_sender_lock_u_read on public.wc_sender_lock_u for select to authenticated using (uid = auth.uid() or public.wc_is_admin());
grant select on public.wc_sender_lock_u to authenticated;

create or replace function public.wc_claim_sender2(p_owner text, p_label text, p_ttl_seconds int default 120)
returns table(owner text, label text, until timestamptz)
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  insert into wc_sender_lock_u as l (uid, owner, label, until)
    values (auth.uid(), p_owner, p_label, now() + make_interval(secs => p_ttl_seconds))
  on conflict (uid) do update set owner = excluded.owner, label = excluded.label, until = excluded.until
    where l.owner = excluded.owner or l.until < now();
  return query select l.owner, l.label, l.until from wc_sender_lock_u l where l.uid = auth.uid();
end $$;
create or replace function public.wc_take_sender2(p_owner text, p_label text, p_ttl_seconds int default 120)
returns table(owner text, label text, until timestamptz)
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  insert into wc_sender_lock_u as l (uid, owner, label, until)
    values (auth.uid(), p_owner, p_label, now() + make_interval(secs => p_ttl_seconds))
  on conflict (uid) do update set owner = excluded.owner, label = excluded.label, until = excluded.until;
  return query select l.owner, l.label, l.until from wc_sender_lock_u l where l.uid = auth.uid();
end $$;
revoke all on function public.wc_claim_sender2(text, text, int) from public, anon;
revoke all on function public.wc_take_sender2(text, text, int) from public, anon;
grant execute on function public.wc_claim_sender2(text, text, int) to authenticated;
grant execute on function public.wc_take_sender2(text, text, int) to authenticated;

-- 6) Make the main HR account Admin, and give all existing data to that Admin
update auth.users
   set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"role":"admin"}'::jsonb
 where lower(email) = 'hrdho@westcoastin.com';
update public.wc_candidates set owner = (select id from auth.users where lower(email) = 'hrdho@westcoastin.com') where owner is null;
update public.wc_email_log  set owner = (select id from auth.users where lower(email) = 'hrdho@westcoastin.com') where owner is null;
-- Admin's own working data (send history, replies, queue state…) becomes private to Admin
update public.wc_kv k
   set key = k.key || '@' || a.id, owner = a.id
  from (select id from auth.users where lower(email) = 'hrdho@westcoastin.com') a
 where k.key in ('history','schedule','updates','lastReport','idMap','idSeq','queueCtl','queueState','replies','replyState')
   and not exists (select 1 from public.wc_kv x where x.key = k.key || '@' || a.id);

-- Check: should list hrdho@westcoastin.com with role admin
select email, raw_app_meta_data ->> 'role' as role from auth.users order by created_at;
