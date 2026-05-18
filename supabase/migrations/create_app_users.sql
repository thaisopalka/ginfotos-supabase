create table public.app_users (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  name text,
  role text not null default 'consulta',
  status text not null default 'ATIVO',
  temporary_password text,
  created_by text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Insert admin user
insert into public.app_users (email, name, role, status)
values ('thaisopalka@gmail.com', 'Thaís Opalka', 'admin', 'ATIVO')
on conflict (email) do update
set role = 'admin', status = 'ATIVO';
