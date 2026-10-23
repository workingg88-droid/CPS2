-- STEP 1 of 2. Run this first in Supabase -> SQL Editor. Safe to run again.
-- Creates the editors table + login checks, then adds your editors.

create extension if not exists pgcrypto with schema extensions;

create table if not exists editors (
  name text primary key,
  pass_hash text not null
);
alter table editors enable row level security;
-- no policies on purpose: the website can never read this table directly

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

-- YOUR EDITORS: change every password below to something long and hard to guess
insert into editors (name, pass_hash) values
  ('ali',      extensions.crypt('CHANGE-ME-ali-1',      extensions.gen_salt('bf'))),
  ('ariful',   extensions.crypt('CHANGE-ME-ariful-2',   extensions.gen_salt('bf'))),
  ('kanoka',   extensions.crypt('CHANGE-ME-kanoka-3',   extensions.gen_salt('bf'))),
  ('ayon',     extensions.crypt('CHANGE-ME-ayon-4',     extensions.gen_salt('bf'))),
  ('francis',  extensions.crypt('CHANGE-ME-francis-5',  extensions.gen_salt('bf'))),
  ('abubakr',  extensions.crypt('CHANGE-ME-abubakr-6',  extensions.gen_salt('bf'))),
  ('abuselom', extensions.crypt('CHANGE-ME-abuselom-7', extensions.gen_salt('bf'))),
  ('andrea',   extensions.crypt('CHANGE-ME-andrea-8',   extensions.gen_salt('bf'))),
  ('luqman',   extensions.crypt('CHANGE-ME-luqman-9',   extensions.gen_salt('bf'))),
  ('abdullah', extensions.crypt('CHANGE-ME-abdullah-10', extensions.gen_salt('bf')))
on conflict (name) do update set pass_hash = excluded.pass_hash;
