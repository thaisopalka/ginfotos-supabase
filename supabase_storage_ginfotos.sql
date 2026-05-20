-- GINFOTOS 6ª CRE - Supabase Storage para Pastas e Anexos
-- Execute no Supabase SQL Editor.

create extension if not exists pgcrypto;

-- Bucket público para anexos do app. Se preferir privado, altere public para false.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('ginfotos-arquivos', 'ginfotos-arquivos', true, 104857600, null)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create table if not exists public.ginfotos_folder_files (
  id uuid primary key default gen_random_uuid(),
  folder_key text not null,
  file_name text not null,
  file_type text,
  file_size bigint,
  storage_path text not null,
  public_url text,
  created_by text,
  created_at timestamptz not null default now()
);

create index if not exists idx_ginfotos_folder_files_folder_key
on public.ginfotos_folder_files(folder_key);

alter table public.ginfotos_folder_files enable row level security;

create policy if not exists "ginfotos_folder_files_select_all"
on public.ginfotos_folder_files
for select
using (true);

create policy if not exists "ginfotos_folder_files_insert_all"
on public.ginfotos_folder_files
for insert
with check (true);

create policy if not exists "ginfotos_folder_files_update_all"
on public.ginfotos_folder_files
for update
using (true)
with check (true);

create policy if not exists "ginfotos_folder_files_delete_all"
on public.ginfotos_folder_files
for delete
using (true);

create policy if not exists "ginfotos_storage_select_all"
on storage.objects
for select
using (bucket_id = 'ginfotos-arquivos');

create policy if not exists "ginfotos_storage_insert_all"
on storage.objects
for insert
with check (bucket_id = 'ginfotos-arquivos');

create policy if not exists "ginfotos_storage_update_all"
on storage.objects
for update
using (bucket_id = 'ginfotos-arquivos')
with check (bucket_id = 'ginfotos-arquivos');

create policy if not exists "ginfotos_storage_delete_all"
on storage.objects
for delete
using (bucket_id = 'ginfotos-arquivos');
