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
