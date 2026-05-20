-- =========================================================
-- GINFOTOS 6ª CRE - SETUP COMPLETO DO SUPABASE
-- Pastas, anexos, Storage e compartilhamento de arquivos
--
-- COMO USAR:
-- 1) Abra o Supabase
-- 2) Vá em SQL Editor
-- 3) Cole TODO este conteúdo
-- 4) Clique em RUN
--
-- IMPORTANTE:
-- Não cole o nome do arquivo no SQL Editor.
-- Cole apenas os comandos SQL deste arquivo.
-- =========================================================

create extension if not exists pgcrypto;

-- =========================================================
-- 1. BUCKET DO STORAGE PARA ARQUIVOS DO GINFOTOS
-- =========================================================

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'ginfotos-arquivos',
  'ginfotos-arquivos',
  true,
  104857600,
  null
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- =========================================================
-- 2. TABELA DE ARQUIVOS DAS PASTAS
-- =========================================================

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

-- Policies da tabela public.ginfotos_folder_files

drop policy if exists "ginfotos_folder_files_select_all" on public.ginfotos_folder_files;
create policy "ginfotos_folder_files_select_all"
on public.ginfotos_folder_files
for select
using (true);

drop policy if exists "ginfotos_folder_files_insert_all" on public.ginfotos_folder_files;
create policy "ginfotos_folder_files_insert_all"
on public.ginfotos_folder_files
for insert
with check (true);

drop policy if exists "ginfotos_folder_files_update_all" on public.ginfotos_folder_files;
create policy "ginfotos_folder_files_update_all"
on public.ginfotos_folder_files
for update
using (true)
with check (true);

drop policy if exists "ginfotos_folder_files_delete_all" on public.ginfotos_folder_files;
create policy "ginfotos_folder_files_delete_all"
on public.ginfotos_folder_files
for delete
using (true);

-- =========================================================
-- 3. TABELA DE PASTAS CRIADAS MANUALMENTE
-- =========================================================

create table if not exists public.ginfotos_extra_folders (
  id text primary key,
  name text not null,
  description text,
  created_by text,
  created_at timestamptz not null default now()
);

alter table public.ginfotos_extra_folders enable row level security;

-- Policies da tabela public.ginfotos_extra_folders

drop policy if exists "ginfotos_extra_folders_select_all" on public.ginfotos_extra_folders;
create policy "ginfotos_extra_folders_select_all"
on public.ginfotos_extra_folders
for select
using (true);

drop policy if exists "ginfotos_extra_folders_insert_all" on public.ginfotos_extra_folders;
create policy "ginfotos_extra_folders_insert_all"
on public.ginfotos_extra_folders
for insert
with check (true);

drop policy if exists "ginfotos_extra_folders_update_all" on public.ginfotos_extra_folders;
create policy "ginfotos_extra_folders_update_all"
on public.ginfotos_extra_folders
for update
using (true)
with check (true);

drop policy if exists "ginfotos_extra_folders_delete_all" on public.ginfotos_extra_folders;
create policy "ginfotos_extra_folders_delete_all"
on public.ginfotos_extra_folders
for delete
using (true);

-- =========================================================
-- 4. POLICIES DO STORAGE PARA O BUCKET ginfotos-arquivos
-- =========================================================

drop policy if exists "ginfotos_storage_select_all" on storage.objects;
create policy "ginfotos_storage_select_all"
on storage.objects
for select
using (bucket_id = 'ginfotos-arquivos');

drop policy if exists "ginfotos_storage_insert_all" on storage.objects;
create policy "ginfotos_storage_insert_all"
on storage.objects
for insert
with check (bucket_id = 'ginfotos-arquivos');

drop policy if exists "ginfotos_storage_update_all" on storage.objects;
create policy "ginfotos_storage_update_all"
on storage.objects
for update
using (bucket_id = 'ginfotos-arquivos')
with check (bucket_id = 'ginfotos-arquivos');

drop policy if exists "ginfotos_storage_delete_all" on storage.objects;
create policy "ginfotos_storage_delete_all"
on storage.objects
for delete
using (bucket_id = 'ginfotos-arquivos');

-- =========================================================
-- 5. LATITUDE E LONGITUDE NA TABELA UNIDADES
-- Evita erro caso a tabela unidades ainda não tenha esses campos.
-- =========================================================

alter table public.unidades
add column if not exists latitude double precision;

alter table public.unidades
add column if not exists longitude double precision;

-- =========================================================
-- FIM
-- Se chegou até aqui sem erro, o Supabase está preparado.
-- =========================================================
