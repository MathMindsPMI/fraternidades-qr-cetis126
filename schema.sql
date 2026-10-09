-- Ejecutar en Supabase SQL Editor. Crear primero usuarios en Authentication > Users.
create table if not exists public.profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 alias text not null unique check(alias ~ '^[a-z0-9_-]{3,32}$'),
 display_name text not null,
 role text not null check(role in ('admin','tutor')),
 house text check(house in ('Agua','Aire','Tierra','Fuego')),
 constraint tutor_house check (role='admin' or house is not null)
);
create table if not exists public.students (
 id text primary key, name text not null, group_name text not null,
 house text not null check(house in ('Agua','Aire','Tierra','Fuego')),
 token text not null unique, created_at timestamptz not null default now()
);
create table if not exists public.missions (
 id uuid primary key default gen_random_uuid(), name text not null,
 mission_date date not null, created_at timestamptz not null default now()
);
create table if not exists public.attendance (
 mission_id uuid not null references public.missions(id) on delete cascade,
 student_id text not null references public.students(id) on delete cascade,
 recorded_at timestamptz not null default now(), recorded_by uuid not null references auth.users(id),
 primary key (mission_id, student_id)
);
create index if not exists students_house_idx on public.students(house);
create index if not exists attendance_student_idx on public.attendance(student_id);
create or replace function public.is_admin() returns boolean language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.profiles where id=auth.uid() and role='admin')
$$;
create or replace function public.my_house() returns text language sql stable security definer set search_path = '' as $$
 select house from public.profiles where id=auth.uid() and role='tutor'
$$;
alter table public.profiles enable row level security;
alter table public.students enable row level security;
alter table public.missions enable row level security;
alter table public.attendance enable row level security;
drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles for select to authenticated using (id=auth.uid() or public.is_admin());
drop policy if exists profiles_admin on public.profiles;
create policy profiles_admin on public.profiles for all to authenticated using(public.is_admin()) with check(public.is_admin());
drop policy if exists students_read on public.students;
create policy students_read on public.students for select to authenticated using(public.is_admin() or house=public.my_house());
drop policy if exists students_admin on public.students;
create policy students_admin on public.students for all to authenticated using(public.is_admin()) with check(public.is_admin());
drop policy if exists missions_read on public.missions;
create policy missions_read on public.missions for select to authenticated using(true);
drop policy if exists missions_admin on public.missions;
create policy missions_admin on public.missions for all to authenticated using(public.is_admin()) with check(public.is_admin());
drop policy if exists attendance_read on public.attendance;
create policy attendance_read on public.attendance for select to authenticated using (
 public.is_admin() or exists(select 1 from public.students s where s.id=student_id and s.house=public.my_house())
);
drop policy if exists attendance_insert on public.attendance;
create policy attendance_insert on public.attendance for insert to authenticated with check (
 recorded_by=auth.uid() and (public.is_admin() or exists(select 1 from public.students s where s.id=student_id and s.house=public.my_house()))
);
-- No se permite editar/borrar asistencias desde clientes.
-- IMPORTANTE: Tras crear usuarios en Authentication > Users, asociarlos así:
-- insert into public.profiles(id,alias,display_name,role,house)
-- select id,'admin','Administración','admin',null from auth.users where email='admin@fraternidades.cetis126.invalid';
-- insert into public.profiles(id,alias,display_name,role,house)
-- select id,'tierra','Tutor Tierra','tutor','Tierra' from auth.users where email='tierra@fraternidades.cetis126.invalid';
