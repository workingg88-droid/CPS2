-- Run in Supabase -> SQL Editor (safe to run on top of the earlier version)

create extension if not exists pgcrypto with schema extensions;

-- clean up the earlier email-login design
drop function if exists is_editor() cascade;
drop table if exists editors cascade;

create table if not exists items (
  id bigint generated always as identity primary key,
  category text not null check (category in ('assignments','quiz','exams')),
  title text not null,
  date date not null
);
alter table items add column if not exists updated_by text;
alter table items add column if not exists updated_at timestamptz default now();

-- editors: name + hashed password (no Supabase Auth users needed)
create table editors (
  name text primary key,
  pass_hash text not null
);

alter table items enable row level security;
alter table editors enable row level security;
drop policy if exists "public read" on items;
create policy "public read" on items for select using (true);
-- no write policies on items and none at all on editors:
-- the website can only change data through the functions below.

create or replace function check_editor(p_name text, p_pass text) returns text
language plpgsql security definer set search_path = public, extensions as $$
declare v text;
begin
  select name into v from editors
   where lower(name) = lower(trim(p_name)) and pass_hash = crypt(p_pass, pass_hash);
  if v is null then raise exception 'Invalid credentials'; end if;
  return v;
end $$;

create or replace function editor_login(p_name text, p_pass text) returns text
language sql security definer set search_path = public, extensions as $$
  select check_editor(p_name, p_pass)
$$;

create or replace function add_item(p_name text, p_pass text, p_category text, p_title text, p_date date) returns text
language plpgsql security definer set search_path = public, extensions as $$
declare v text;
begin
  v := check_editor(p_name, p_pass);
  if p_category not in ('assignments','quiz','exams') then raise exception 'Invalid category'; end if;
  insert into items (category, title, date, updated_by, updated_at)
  values (p_category, trim(p_title), p_date, v, now());
  return v;
end $$;

create or replace function edit_item(p_name text, p_pass text, p_id bigint, p_title text, p_date date) returns text
language plpgsql security definer set search_path = public, extensions as $$
declare v text;
begin
  v := check_editor(p_name, p_pass);
  update items set title = trim(p_title), date = p_date, updated_by = v, updated_at = now() where id = p_id;
  if not found then raise exception 'Item not found'; end if;
  return v;
end $$;

create or replace function delete_item(p_name text, p_pass text, p_id bigint) returns text
language plpgsql security definer set search_path = public, extensions as $$
declare v text;
begin
  v := check_editor(p_name, p_pass);
  delete from items where id = p_id;
  if not found then raise exception 'Item not found'; end if;
  return v;
end $$;

-- seed data (only if the table is empty)
do $$ begin
  if not exists (select 1 from items) then
    insert into items (category,title,date) values
    ('assignments','Assignment 1','2026-09-05'),('assignments','Assignment 2','2026-09-19'),
    ('assignments','Assignment 3','2026-10-03'),('assignments','Assignment 4','2026-10-17'),
    ('assignments','Assignment 5','2026-10-31'),('assignments','Assignment 6','2026-11-14'),
    ('quiz','Quiz 1','2026-09-12'),('quiz','Quiz 2','2026-10-10'),('quiz','Quiz 3','2026-11-07'),
    ('exams','Mid Term Exam','2026-10-24'),('exams','Final Exam','2026-12-12');
  end if;
end $$;

-- YOUR 7-8 EDITORS: change names and passwords here (name, password)
insert into editors (name, pass_hash) values
  ('ali',    extensions.crypt('ali',    extensions.gen_salt('bf'))),
  ('name2',  extensions.crypt('pass2',  extensions.gen_salt('bf'))),
  ('name3',  extensions.crypt('pass3',  extensions.gen_salt('bf'))),
  ('name4',  extensions.crypt('pass4',  extensions.gen_salt('bf'))),
  ('name5',  extensions.crypt('pass5',  extensions.gen_salt('bf'))),
  ('name6',  extensions.crypt('pass6',  extensions.gen_salt('bf'))),
  ('name7',  extensions.crypt('pass7',  extensions.gen_salt('bf')))
on conflict (name) do update set pass_hash = excluded.pass_hash;
