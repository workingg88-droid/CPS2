-- Run in Supabase -> SQL Editor (after setup.sql). Makes subjects, teachers and lists
-- (categories) fully dynamic. Replaces the earlier items/subject design and reloads the data.
-- Your editors list is not touched.

drop function if exists add_item(text, text, text, text, date);
drop function if exists add_item(text, text, text, text, text, date);
drop function if exists add_item(text, text, bigint, text, date);
drop table if exists items cascade;
drop table if exists categories cascade;
drop table if exists subjects cascade;

create table subjects (
  id bigint generated always as identity primary key,
  name text not null,
  teacher text not null default '',
  position int not null default 0
);
create table categories (
  id bigint generated always as identity primary key,
  subject_id bigint not null references subjects(id) on delete cascade,
  label text not null,
  position int not null default 0
);
create table items (
  id bigint generated always as identity primary key,
  category_id bigint not null references categories(id) on delete cascade,
  title text not null,
  date date not null,
  updated_by text,
  updated_at timestamptz default now()
);

alter table subjects enable row level security;
alter table categories enable row level security;
alter table items enable row level security;
create policy "public read" on subjects for select using (true);
create policy "public read" on categories for select using (true);
create policy "public read" on items for select using (true);
-- no write policies: changes only go through the functions below (name + password checked)

-- ---------- subjects ----------
create or replace function add_subject(p_name text, p_pass text, p_sname text, p_teacher text) returns text
language plpgsql security definer set search_path = public, extensions as $$
declare v text;
begin
  v := check_editor(p_name, p_pass);
  if trim(coalesce(p_sname,'')) = '' then raise exception 'Subject name is empty'; end if;
  insert into subjects (name, teacher, position)
  values (trim(p_sname), trim(coalesce(p_teacher,'')), coalesce((select max(position) + 1 from subjects), 1));
  return v;
end $$;

create or replace function edit_subject(p_name text, p_pass text, p_id bigint, p_sname text, p_teacher text) returns text
language plpgsql security definer set search_path = public, extensions as $$
declare v text;
begin
  v := check_editor(p_name, p_pass);
  if trim(coalesce(p_sname,'')) = '' then raise exception 'Subject name is empty'; end if;
  update subjects set name = trim(p_sname), teacher = trim(coalesce(p_teacher,'')) where id = p_id;
  if not found then raise exception 'Subject not found'; end if;
  return v;
end $$;

create or replace function delete_subject(p_name text, p_pass text, p_id bigint) returns text
language plpgsql security definer set search_path = public, extensions as $$
declare v text;
begin
  v := check_editor(p_name, p_pass);
  delete from subjects where id = p_id;
  if not found then raise exception 'Subject not found'; end if;
  return v;
end $$;

-- ---------- categories (lists) ----------
create or replace function add_category(p_name text, p_pass text, p_subject_id bigint, p_label text) returns text
language plpgsql security definer set search_path = public, extensions as $$
declare v text;
begin
  v := check_editor(p_name, p_pass);
  if trim(coalesce(p_label,'')) = '' then raise exception 'List name is empty'; end if;
  if not exists (select 1 from subjects where id = p_subject_id) then raise exception 'Subject not found'; end if;
  insert into categories (subject_id, label, position)
  values (p_subject_id, trim(p_label), coalesce((select max(position) + 1 from categories where subject_id = p_subject_id), 1));
  return v;
end $$;

create or replace function edit_category(p_name text, p_pass text, p_id bigint, p_label text) returns text
language plpgsql security definer set search_path = public, extensions as $$
declare v text;
begin
  v := check_editor(p_name, p_pass);
  if trim(coalesce(p_label,'')) = '' then raise exception 'List name is empty'; end if;
  update categories set label = trim(p_label) where id = p_id;
  if not found then raise exception 'List not found'; end if;
  return v;
end $$;

create or replace function delete_category(p_name text, p_pass text, p_id bigint) returns text
language plpgsql security definer set search_path = public, extensions as $$
declare v text;
begin
  v := check_editor(p_name, p_pass);
  delete from categories where id = p_id;
  if not found then raise exception 'List not found'; end if;
  return v;
end $$;

-- ---------- items ----------
create or replace function add_item(p_name text, p_pass text, p_category_id bigint, p_title text, p_date date) returns text
language plpgsql security definer set search_path = public, extensions as $$
declare v text;
begin
  v := check_editor(p_name, p_pass);
  if trim(coalesce(p_title,'')) = '' then raise exception 'Title is empty'; end if;
  if not exists (select 1 from categories where id = p_category_id) then raise exception 'List not found'; end if;
  insert into items (category_id, title, date, updated_by, updated_at)
  values (p_category_id, trim(p_title), p_date, v, now());
  return v;
end $$;

create or replace function edit_item(p_name text, p_pass text, p_id bigint, p_title text, p_date date) returns text
language plpgsql security definer set search_path = public, extensions as $$
declare v text;
begin
  v := check_editor(p_name, p_pass);
  if trim(coalesce(p_title,'')) = '' then raise exception 'Title is empty'; end if;
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

-- ---------- starting data (you can change all of it later from the chat) ----------
do $$
declare s bigint; c bigint;
begin
  insert into subjects (name, teacher, position) values ('Command Line and Scripting', 'Prof. Luis Gustavo Nardin', 1) returning id into s;
  insert into categories (subject_id, label, position) values (s, 'Assignments', 1) returning id into c;
  insert into items (category_id, title, date) values
    (c, 'Data processing commands', '2026-09-22'), (c, 'Basic scripting', '2026-09-29'),
    (c, 'Basic AWK', '2026-10-07'), (c, 'From the problem to script', '2026-10-28');
  insert into categories (subject_id, label, position) values (s, 'Exam', 2) returning id into c;
  insert into items (category_id, title, date) values (c, 'Exam', '2026-11-04');

  insert into subjects (name, teacher, position) values ('Technological foundations of software development', 'Maxime Lefrançois', 2) returning id into s;
  insert into categories (subject_id, label, position) values (s, 'Assignments', 1) returning id into c;
  insert into items (category_id, title, date) values
    (c, 'Deadline 1 - Lectures 1-2', '2026-10-16'), (c, 'Deadline 2 - Lectures 3-4', '2026-11-13'),
    (c, 'Deadline 3 - Lecture 5', '2026-12-04'), (c, 'Deadline 4 - Lectures 6-7', '2027-01-08');
  insert into categories (subject_id, label, position) values (s, 'Quizzes (MCQ)', 2) returning id into c;
  insert into items (category_id, title, date) values
    (c, 'MCQ Quiz - Lecture 1', '2026-09-15'), (c, 'MCQ Quiz - Lecture 2', '2026-10-15'),
    (c, 'MCQ Quiz - Lecture 3', '2026-11-19'), (c, 'MCQ Quiz - Lecture 4', '2026-11-19'),
    (c, 'MCQ Quiz - Lecture 5', '2026-12-08'), (c, 'MCQ Quiz - Lecture 6', '2026-12-17'),
    (c, 'MCQ Quiz - Lecture 7 (to be confirmed)', '2027-01-06');

  insert into subjects (name, teacher, position) values ('Data interoperability and Semantics', 'Maxime Lefrançois', 3) returning id into s;
  insert into categories (subject_id, label, position) values (s, 'Assignments', 1) returning id into c;
  insert into items (category_id, title, date) values
    (c, 'Practical work 1', '2026-11-13'), (c, 'Practical work 2', '2027-01-14');
  insert into categories (subject_id, label, position) values (s, 'Quizzes (MCQ)', 2) returning id into c;
  insert into items (category_id, title, date) values
    (c, 'MCQ 1 - Course 1', '2026-09-14'), (c, 'MCQ 2 - Course 2', '2026-09-24'),
    (c, 'MCQ 3 - Course 3', '2026-10-14'), (c, 'MCQ 4 - Course 4', '2026-11-24'),
    (c, 'MCQ 5 - Course 5', '2027-01-15');
  insert into categories (subject_id, label, position) values (s, 'Exams', 3) returning id into c;
  insert into items (category_id, title, date) values
    (c, 'Exam 1 (Courses 1-3)', '2026-11-04'), (c, 'Final exam', '2027-01-15');
end $$;
