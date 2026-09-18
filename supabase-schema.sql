-- Схема базы данных музея для Supabase.
create extension if not exists pgcrypto;

create table if not exists public.periods (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
create table if not exists public.exhibits (
  id uuid primary key default gen_random_uuid(),
  period_id uuid not null references public.periods(id) on delete cascade,
  title text not null,
  description text not null default '',
  photo_path text, video_path text, audio_path text,
  created_at timestamptz not null default now()
);
create table if not exists public.veterans (
  id uuid primary key default gen_random_uuid(),
  period_id uuid not null references public.periods(id) on delete cascade,
  title text not null,
  description text not null default '',
  photo_path text, video_path text, audio_path text,
  created_at timestamptz not null default now()
);
create table if not exists public.director (
  id integer primary key default 1 check (id = 1),
  bio text not null default '', photo_path text,
  updated_at timestamptz not null default now()
);
create table if not exists public.meetings (
  id uuid primary key default gen_random_uuid(),
  date text not null default '', title text not null,
  description text not null default '',
  video_path text, audio_path text,
  created_at timestamptz not null default now()
);
create table if not exists public.students (
  id uuid primary key default gen_random_uuid(),
  title text not null, description text not null default '',
  link text, created_at timestamptz not null default now()
);

insert into public.periods (title,sort_order)
select * from (values
('01.01.1800 — 01.01.1850',0),('01.01.1850 — 01.01.1900',1),
('01.01.1900 — 01.01.1914',2),('01.01.1914 — 01.01.1918',3),
('01.01.1918 — 01.01.1941',4),('01.01.1941 — 01.01.1945',5),
('01.01.1945 — 01.01.1991',6),('01.01.1991 — 01.01.2000',7),
('01.01.2000 — наше время',8)) v(title,sort_order)
where not exists (select 1 from public.periods);

insert into public.director(id,bio) values (1,'Здесь размещается биография заведующего музеем.') on conflict (id) do nothing;

alter table public.periods enable row level security;
alter table public.exhibits enable row level security;
alter table public.veterans enable row level security;
alter table public.director enable row level security;
alter table public.meetings enable row level security;
alter table public.students enable row level security;

create policy "public read periods" on public.periods for select using (true);
create policy "public read exhibits" on public.exhibits for select using (true);
create policy "public read veterans" on public.veterans for select using (true);
create policy "public read director" on public.director for select using (true);
create policy "public read meetings" on public.meetings for select using (true);
create policy "public read students" on public.students for select using (true);

-- В Supabase Storage создайте buckets:
-- museum-photos, museum-videos, museum-audio.
-- Для публичного просмотра включите Public bucket.


-- Реальные роли Supabase Auth: developer / admin.
do $$ begin
  create type public.app_role as enum ('developer','admin');
exception when duplicate_object then null;
end $$;

create table if not exists public.user_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role public.app_role not null
);

alter table public.user_roles enable row level security;

drop policy if exists "users read own role" on public.user_roles;
create policy "users read own role"
on public.user_roles for select
to authenticated
using (auth.uid() = user_id);

-- Только developer может управлять ролями из SQL/серверной части.
-- Не выдаём authenticated пользователям INSERT/UPDATE/DELETE на user_roles.

drop policy if exists "admins and developers manage periods" on public.periods;
create policy "admins and developers manage periods" on public.periods
for all to authenticated
using (exists (select 1 from public.user_roles r where r.user_id=auth.uid() and r.role in ('developer','admin')))
with check (exists (select 1 from public.user_roles r where r.user_id=auth.uid() and r.role in ('developer','admin')));

drop policy if exists "admins and developers manage exhibits" on public.exhibits;
create policy "admins and developers manage exhibits" on public.exhibits
for all to authenticated
using (exists (select 1 from public.user_roles r where r.user_id=auth.uid() and r.role in ('developer','admin')))
with check (exists (select 1 from public.user_roles r where r.user_id=auth.uid() and r.role in ('developer','admin')));

drop policy if exists "admins and developers manage veterans" on public.veterans;
create policy "admins and developers manage veterans" on public.veterans
for all to authenticated
using (exists (select 1 from public.user_roles r where r.user_id=auth.uid() and r.role in ('developer','admin')))
with check (exists (select 1 from public.user_roles r where r.user_id=auth.uid() and r.role in ('developer','admin')));

drop policy if exists "admins and developers manage director" on public.director;
create policy "admins and developers manage director" on public.director
for all to authenticated
using (exists (select 1 from public.user_roles r where r.user_id=auth.uid() and r.role in ('developer','admin')))
with check (exists (select 1 from public.user_roles r where r.user_id=auth.uid() and r.role in ('developer','admin')));

drop policy if exists "admins and developers manage meetings" on public.meetings;
create policy "admins and developers manage meetings" on public.meetings
for all to authenticated
using (exists (select 1 from public.user_roles r where r.user_id=auth.uid() and r.role in ('developer','admin')))
with check (exists (select 1 from public.user_roles r where r.user_id=auth.uid() and r.role in ('developer','admin')));

drop policy if exists "admins and developers manage students" on public.students;
create policy "admins and developers manage students" on public.students
for all to authenticated
using (exists (select 1 from public.user_roles r where r.user_id=auth.uid() and r.role in ('developer','admin')))
with check (exists (select 1 from public.user_roles r where r.user_id=auth.uid() and r.role in ('developer','admin')));

-- Storage: публичное чтение, запись/изменение/удаление только для реальных администраторов.
drop policy if exists "public read museum photos" on storage.objects;
create policy "public read museum photos" on storage.objects for select
to anon, authenticated using (bucket_id = 'museum-photos');

drop policy if exists "staff write museum photos" on storage.objects;
create policy "staff write museum photos" on storage.objects for insert
to authenticated with check (bucket_id = 'museum-photos' and exists (select 1 from public.user_roles r where r.user_id=auth.uid() and r.role in ('developer','admin')));

drop policy if exists "staff update museum photos" on storage.objects;
create policy "staff update museum photos" on storage.objects for update
to authenticated using (bucket_id = 'museum-photos' and exists (select 1 from public.user_roles r where r.user_id=auth.uid() and r.role in ('developer','admin')));

drop policy if exists "staff delete museum photos" on storage.objects;
create policy "staff delete museum photos" on storage.objects for delete
to authenticated using (bucket_id = 'museum-photos' and exists (select 1 from public.user_roles r where r.user_id=auth.uid() and r.role in ('developer','admin')));

drop policy if exists "public read museum videos" on storage.objects;
create policy "public read museum videos" on storage.objects for select
to anon, authenticated using (bucket_id = 'museum-videos');

drop policy if exists "staff write museum videos" on storage.objects;
create policy "staff write museum videos" on storage.objects for insert
to authenticated with check (bucket_id = 'museum-videos' and exists (select 1 from public.user_roles r where r.user_id=auth.uid() and r.role in ('developer','admin')));

drop policy if exists "staff update museum videos" on storage.objects;
create policy "staff update museum videos" on storage.objects for update
to authenticated using (bucket_id = 'museum-videos' and exists (select 1 from public.user_roles r where r.user_id=auth.uid() and r.role in ('developer','admin')));

drop policy if exists "staff delete museum videos" on storage.objects;
create policy "staff delete museum videos" on storage.objects for delete
to authenticated using (bucket_id = 'museum-videos' and exists (select 1 from public.user_roles r where r.user_id=auth.uid() and r.role in ('developer','admin')));

drop policy if exists "public read museum audio" on storage.objects;
create policy "public read museum audio" on storage.objects for select
to anon, authenticated using (bucket_id = 'museum-audio');

drop policy if exists "staff write museum audio" on storage.objects;
create policy "staff write museum audio" on storage.objects for insert
to authenticated with check (bucket_id = 'museum-audio' and exists (select 1 from public.user_roles r where r.user_id=auth.uid() and r.role in ('developer','admin')));

drop policy if exists "staff update museum audio" on storage.objects;
create policy "staff update museum audio" on storage.objects for update
to authenticated using (bucket_id = 'museum-audio' and exists (select 1 from public.user_roles r where r.user_id=auth.uid() and r.role in ('developer','admin')));

drop policy if exists "staff delete museum audio" on storage.objects;
create policy "staff delete museum audio" on storage.objects for delete
to authenticated using (bucket_id = 'museum-audio' and exists (select 1 from public.user_roles r where r.user_id=auth.uid() and r.role in ('developer','admin')));
