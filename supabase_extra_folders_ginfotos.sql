-- GINFOTOS 6ª CRE - Pastas criadas manualmente no Supabase
-- Execute no Supabase SQL Editor junto com o arquivo supabase_storage_ginfotos.sql.

create table if not exists public.ginfotos_extra_folders (
  id text primary key,
  name text not null,
  description text,
  created_by text,
  created_at timestamptz not null default now()
);

alter table public.ginfotos_extra_folders enable row level security;

create policy if not exists "ginfotos_extra_folders_select_all"
on public.ginfotos_extra_folders
for select
using (true);

create policy if not exists "ginfotos_extra_folders_insert_all"
on public.ginfotos_extra_folders
for insert
with check (true);

create policy if not exists "ginfotos_extra_folders_update_all"
on public.ginfotos_extra_folders
for update
using (true)
with check (true);

create policy if not exists "ginfotos_extra_folders_delete_all"
on public.ginfotos_extra_folders
for delete
using (true);
