-- KLabMusic — initial schema
-- Run this in the Supabase SQL Editor (Project → SQL → New query → paste → Run).
-- Safe to run multiple times: every CREATE / POLICY uses IF NOT EXISTS or guards.

-- =========================================================
-- Tables
-- =========================================================

create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users on delete cascade,
  name text,
  data jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists clips (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users on delete cascade,
  name text,
  url text,
  duration float,
  metadata jsonb,
  created_at timestamptz default now()
);

create table if not exists key_bindings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users on delete cascade,
  name text,
  bindings jsonb,
  is_default boolean default false,
  created_at timestamptz default now()
);

create table if not exists user_themes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users on delete cascade,
  name text,
  colors jsonb,
  created_at timestamptz default now()
);

create table if not exists rooms (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  host_id text,
  state jsonb,
  created_at timestamptz default now()
);

-- =========================================================
-- Row-level security
-- =========================================================

alter table projects enable row level security;
alter table clips enable row level security;
alter table key_bindings enable row level security;
alter table user_themes enable row level security;
alter table rooms enable row level security;

-- Per-user tables: owners only
do $$
begin
  if not exists (select 1 from pg_policies where policyname = 'projects_owner_all') then
    create policy projects_owner_all on projects for all
      using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where policyname = 'clips_owner_all') then
    create policy clips_owner_all on clips for all
      using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where policyname = 'key_bindings_owner_all') then
    create policy key_bindings_owner_all on key_bindings for all
      using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where policyname = 'user_themes_owner_all') then
    create policy user_themes_owner_all on user_themes for all
      using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
end $$;

-- Rooms: anyone (anon + authenticated) may create + read so guests can jam.
-- Tighten in a future migration if abuse becomes an issue.
do $$
begin
  if not exists (select 1 from pg_policies where policyname = 'rooms_select_all') then
    create policy rooms_select_all on rooms for select using (true);
  end if;
  if not exists (select 1 from pg_policies where policyname = 'rooms_insert_all') then
    create policy rooms_insert_all on rooms for insert with check (true);
  end if;
  if not exists (select 1 from pg_policies where policyname = 'rooms_update_all') then
    create policy rooms_update_all on rooms for update using (true) with check (true);
  end if;
end $$;

-- =========================================================
-- Storage buckets
-- =========================================================

insert into storage.buckets (id, name, public)
values ('user-clips', 'user-clips', false)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('project-exports', 'project-exports', false)
on conflict (id) do nothing;

-- Storage policies: each user can manage their own folder ({user_id}/...)
do $$
begin
  if not exists (select 1 from pg_policies where policyname = 'user_clips_owner_select') then
    create policy user_clips_owner_select on storage.objects for select
      using (bucket_id = 'user-clips' and auth.uid()::text = (storage.foldername(name))[1]);
  end if;
  if not exists (select 1 from pg_policies where policyname = 'user_clips_owner_insert') then
    create policy user_clips_owner_insert on storage.objects for insert
      with check (bucket_id = 'user-clips' and auth.uid()::text = (storage.foldername(name))[1]);
  end if;
  if not exists (select 1 from pg_policies where policyname = 'user_clips_owner_update') then
    create policy user_clips_owner_update on storage.objects for update
      using (bucket_id = 'user-clips' and auth.uid()::text = (storage.foldername(name))[1]);
  end if;
  if not exists (select 1 from pg_policies where policyname = 'user_clips_owner_delete') then
    create policy user_clips_owner_delete on storage.objects for delete
      using (bucket_id = 'user-clips' and auth.uid()::text = (storage.foldername(name))[1]);
  end if;

  if not exists (select 1 from pg_policies where policyname = 'project_exports_owner_select') then
    create policy project_exports_owner_select on storage.objects for select
      using (bucket_id = 'project-exports' and auth.uid()::text = (storage.foldername(name))[1]);
  end if;
  if not exists (select 1 from pg_policies where policyname = 'project_exports_owner_insert') then
    create policy project_exports_owner_insert on storage.objects for insert
      with check (bucket_id = 'project-exports' and auth.uid()::text = (storage.foldername(name))[1]);
  end if;
end $$;

-- =========================================================
-- Realtime channels (broadcast / presence) work out of the box.
-- No setup needed beyond the project being live.
-- =========================================================
