-- GINFOTOS 6a CRE - Estrutura base do Supabase
-- Execute este arquivo no Supabase: SQL Editor > New query > Run.
-- Ele cria/ajusta as tabelas usadas pelo app sem apagar dados existentes.

create extension if not exists pgcrypto;

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
alter table public.unidades add column if not exists created_at timestamptz default now();
alter table public.unidades add column if not exists updated_at timestamptz default now();

create unique index if not exists unidades_designacao_unique on public.unidades (designacao) where designacao is not null and designacao <> '';

create table if not exists public.visitas (
  id uuid primary key default gen_random_uuid(),
  visitor_name text,
  unidade_id text,
  visit_date date,
  notes text,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.visitas add column if not exists visitor_name text;
alter table public.visitas add column if not exists unidade_id text;
alter table public.visitas add column if not exists visit_date date;
alter table public.visitas add column if not exists notes text;
alter table public.visitas add column if not exists created_by text;
alter table public.visitas add column if not exists created_at timestamptz default now();
alter table public.visitas add column if not exists updated_at timestamptz default now();

create table if not exists public.pastas (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.pastas add column if not exists name text;
alter table public.pastas add column if not exists description text;
alter table public.pastas add column if not exists created_at timestamptz default now();
alter table public.pastas add column if not exists updated_at timestamptz default now();

create table if not exists public.user_invites (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  role text default 'consulta',
  invited_by text,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.user_invites add column if not exists email text;
alter table public.user_invites add column if not exists role text default 'consulta';
alter table public.user_invites add column if not exists invited_by text;
alter table public.user_invites add column if not exists used_at timestamptz;
alter table public.user_invites add column if not exists created_at timestamptz default now();

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_app_users_updated_at on public.app_users;
create trigger set_app_users_updated_at
before update on public.app_users
for each row execute function public.set_updated_at();

drop trigger if exists set_unidades_updated_at on public.unidades;
create trigger set_unidades_updated_at
before update on public.unidades
for each row execute function public.set_updated_at();

drop trigger if exists set_visitas_updated_at on public.visitas;
create trigger set_visitas_updated_at
before update on public.visitas
for each row execute function public.set_updated_at();

drop trigger if exists set_pastas_updated_at on public.pastas;
create trigger set_pastas_updated_at
before update on public.pastas
for each row execute function public.set_updated_at();

alter table public.app_users enable row level security;
alter table public.unidades enable row level security;
alter table public.visitas enable row level security;
alter table public.pastas enable row level security;
alter table public.user_invites enable row level security;

drop policy if exists app_users_public_read on public.app_users;
create policy app_users_public_read on public.app_users for select using (true);

drop policy if exists app_users_public_insert on public.app_users;
create policy app_users_public_insert on public.app_users for insert with check (true);

drop policy if exists app_users_public_update on public.app_users;
create policy app_users_public_update on public.app_users for update using (true) with check (true);

drop policy if exists app_users_public_delete on public.app_users;
create policy app_users_public_delete on public.app_users for delete using (true);

drop policy if exists unidades_public_all on public.unidades;
create policy unidades_public_all on public.unidades for all using (true) with check (true);

drop policy if exists visitas_public_all on public.visitas;
create policy visitas_public_all on public.visitas for all using (true) with check (true);

drop policy if exists pastas_public_all on public.pastas;
create policy pastas_public_all on public.pastas for all using (true) with check (true);

drop policy if exists user_invites_public_all on public.user_invites;
create policy user_invites_public_all on public.user_invites for all using (true) with check (true);

insert into public.app_users (email, name, role, status, temporary_password, created_by)
values ('thaisopalka@gmail.com', 'Thais Opalka', 'admin', 'ATIVO', '12345678', 'schema')
on conflict (email) do update set
  name = excluded.name,
  role = 'admin',
  status = 'ATIVO',
  updated_at = now();
