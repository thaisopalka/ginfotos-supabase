-- ==============================================================================
-- GINFOTOS 6ª CRE - SETUP DEFINITIVO E ATUALIZADO DO SUPABASE
-- ==============================================================================
-- Este script configura TODAS as tabelas, permissões (RLS) e Buckets de Fotos
-- necessários para o GINFOTOS funcionar perfeitamente com múltiplos usuários.
--
-- COMO EXECUTAR:
-- 1. Abra o painel do seu projeto no Supabase (https://supabase.com/dashboard)
-- 2. No menu lateral esquerdo, clique em "SQL Editor"
-- 3. Clique em "+ New query" (ou crie uma nova consulta)
-- 4. Copie e cole TODO este arquivo
-- 5. Clique no botão verde "RUN" no canto inferior direito
-- ==============================================================================

create extension if not exists pgcrypto;

-- ------------------------------------------------------------------------------
-- 1. TABELA DE USUÁRIOS (app_users)
-- ------------------------------------------------------------------------------
create table if not exists public.app_users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  name text,
  role text not null default 'consulta',
  status text not null default 'ATIVO',
  temporary_password text,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.app_users add column if not exists email text;
alter table public.app_users add column if not exists name text;
alter table public.app_users add column if not exists role text default 'consulta';
alter table public.app_users add column if not exists status text default 'ATIVO';
alter table public.app_users add column if not exists temporary_password text;
alter table public.app_users add column if not exists created_by text;
alter table public.app_users add column if not exists created_at timestamptz default now();
alter table public.app_users add column if not exists updated_at timestamptz default now();

create unique index if not exists app_users_email_unique on public.app_users (lower(email));

-- ------------------------------------------------------------------------------
-- 2. TABELA DE UNIDADES ESCOLARES (unidades)
-- ------------------------------------------------------------------------------
create table if not exists public.unidades (
  id uuid primary key default gen_random_uuid(),
  designacao text,
  name text not null,
  address text,
  bairro text,
  telefone text,
  diretor_geral text,
  celular_diretor_geral text,
  diretor_adjunto text,
  celular_diretor_adjunto text,
  latitude double precision,
  longitude double precision,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.unidades add column if not exists designacao text;
alter table public.unidades add column if not exists name text;
alter table public.unidades add column if not exists address text;
alter table public.unidades add column if not exists bairro text;
alter table public.unidades add column if not exists telefone text;
alter table public.unidades add column if not exists diretor_geral text;
alter table public.unidades add column if not exists celular_diretor_geral text;
alter table public.unidades add column if not exists diretor_adjunto text;
alter table public.unidades add column if not exists celular_diretor_adjunto text;
alter table public.unidades add column if not exists latitude double precision;
alter table public.unidades add column if not exists longitude double precision;
alter table public.unidades add column if not exists created_at timestamptz default now();
alter table public.unidades add column if not exists updated_at timestamptz default now();

create unique index if not exists unidades_designacao_unique on public.unidades (designacao) where designacao is not null and designacao <> '';

-- ------------------------------------------------------------------------------
-- 3. TABELA DE VISITAS TÉCNICAS (visitas)
-- ------------------------------------------------------------------------------
create table if not exists public.visitas (
  id uuid primary key default gen_random_uuid(),
  client_id text,
  visitor_name text,
  unidade_id text,
  visit_date date,
  notes text,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.visitas add column if not exists client_id text;
alter table public.visitas add column if not exists visitor_name text;
alter table public.visitas add column if not exists unidade_id text;
alter table public.visitas add column if not exists visit_date date;
alter table public.visitas add column if not exists notes text;
alter table public.visitas add column if not exists created_by text;
alter table public.visitas add column if not exists created_at timestamptz default now();
alter table public.visitas add column if not exists updated_at timestamptz default now();

create index if not exists idx_visitas_client_id on public.visitas(client_id);
create index if not exists idx_visitas_unidade_id on public.visitas(unidade_id);
create index if not exists idx_visitas_visit_date on public.visitas(visit_date desc);

-- ------------------------------------------------------------------------------
-- 4. TABELA DE FOTOS DAS VISITAS (fotos_visita) - CRUCIAL PARA SINCRONIZAÇÃO
-- ------------------------------------------------------------------------------
create table if not exists public.fotos_visita (
  id uuid primary key default gen_random_uuid(),
  visita_id text not null,
  storage_path text not null,
  arquivo_url text,
  legenda text default '',
  ordem integer default 0,
  status_legenda text default 'SEM_LEGENDA',
  created_at timestamptz not null default now()
);

alter table public.fotos_visita add column if not exists visita_id text;
alter table public.fotos_visita add column if not exists storage_path text;
alter table public.fotos_visita add column if not exists arquivo_url text;
alter table public.fotos_visita add column if not exists legenda text default '';
alter table public.fotos_visita add column if not exists ordem integer default 0;
alter table public.fotos_visita add column if not exists status_legenda text default 'SEM_LEGENDA';
alter table public.fotos_visita add column if not exists created_at timestamptz default now();

create index if not exists idx_fotos_visita_visita_id on public.fotos_visita(visita_id);
create index if not exists idx_fotos_visita_storage_path on public.fotos_visita(storage_path);

-- ------------------------------------------------------------------------------
-- 5. TABELA DE PASTAS E ARQUIVOS (pastas, ginfotos_folder_files, ginfotos_extra_folders)
-- ------------------------------------------------------------------------------
create table if not exists public.pastas (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ginfotos_extra_folders (
  id text primary key,
  name text not null,
  description text,
  created_by text,
  created_at timestamptz not null default now()
);

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

create index if not exists idx_ginfotos_folder_files_folder_key on public.ginfotos_folder_files(folder_key);

-- ------------------------------------------------------------------------------
-- 6. BUCKETS DE STORAGE DO SUPABASE (visita-fotos e ginfotos-arquivos)
-- ------------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('visita-fotos', 'visita-fotos', true, 104857600, null)
on conflict (id) do update
set public = true,
    file_size_limit = 104857600;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('ginfotos-arquivos', 'ginfotos-arquivos', true, 104857600, null)
on conflict (id) do update
set public = true,
    file_size_limit = 104857600;

-- ------------------------------------------------------------------------------
-- 7. POLÍTICAS DE ACESSO (RLS - Row Level Security)
-- ------------------------------------------------------------------------------
-- Habilitar RLS em todas as tabelas
alter table public.app_users enable row level security;
alter table public.unidades enable row level security;
alter table public.visitas enable row level security;
alter table public.fotos_visita enable row level security;
alter table public.pastas enable row level security;
alter table public.ginfotos_extra_folders enable row level security;
alter table public.ginfotos_folder_files enable row level security;

-- app_users
drop policy if exists "app_users_all" on public.app_users;
create policy "app_users_all" on public.app_users for all using (true) with check (true);

-- unidades
drop policy if exists "unidades_all" on public.unidades;
create policy "unidades_all" on public.unidades for all using (true) with check (true);

-- visitas
drop policy if exists "visitas_all" on public.visitas;
create policy "visitas_all" on public.visitas for all using (true) with check (true);

-- fotos_visita
drop policy if exists "fotos_visita_all" on public.fotos_visita;
create policy "fotos_visita_all" on public.fotos_visita for all using (true) with check (true);

-- pastas
drop policy if exists "pastas_all" on public.pastas;
create policy "pastas_all" on public.pastas for all using (true) with check (true);

-- ginfotos_extra_folders
drop policy if exists "ginfotos_extra_folders_all" on public.ginfotos_extra_folders;
create policy "ginfotos_extra_folders_all" on public.ginfotos_extra_folders for all using (true) with check (true);

-- ginfotos_folder_files
drop policy if exists "ginfotos_folder_files_all" on public.ginfotos_folder_files;
create policy "ginfotos_folder_files_all" on public.ginfotos_folder_files for all using (true) with check (true);

-- Políticas para os objetos no Storage (visita-fotos e ginfotos-arquivos)
drop policy if exists "ginfotos_storage_visita_fotos_all" on storage.objects;
create policy "ginfotos_storage_visita_fotos_all" on storage.objects
for all using (bucket_id in ('visita-fotos', 'ginfotos-arquivos'))
with check (bucket_id in ('visita-fotos', 'ginfotos-arquivos'));

-- ------------------------------------------------------------------------------
-- 8. GARANTIR USUÁRIA ADMINISTRADORA PADRÃO
-- ------------------------------------------------------------------------------
insert into public.app_users (email, name, role, status, temporary_password, created_by)
values ('thaisopalka@gmail.com', 'Thaís Opalka', 'admin', 'ATIVO', '12345678', 'setup')
on conflict (email) do update set
  name = 'Thaís Opalka',
  role = 'admin',
  status = 'ATIVO',
  updated_at = now();

-- FIM DO SETUP DEFINITIVO
