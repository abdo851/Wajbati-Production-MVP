-- REVIEW REQUIRED BEFORE APPLYING. Human must approve.
-- This file is not applied by the app. Do not run it until a person has read it.
-- It does not create, change, or drop any row level security policy.
--
-- Intended policies, written here as comments only:
-- chef_documents: a chef may insert and update rows where the chef profile belongs to auth.uid().
-- chef_documents: an admin may select every row.
-- storage bucket chef-documents: a chef may insert objects only in a folder named with auth.uid().
-- storage bucket chef-documents: an admin may select objects in this bucket.
-- Existing kitchens receive approval_status = 'pending' from the column default.
-- A human should set approval_status = 'approved' for kitchens that are already trusted.

alter table public.chefs add column if not exists cin_storage_path text;
alter table public.chefs add column if not exists auto_entrepreneur_number text;
alter table public.chefs add column if not exists food_safety_accepted_at timestamptz;
alter table public.chefs
  add column if not exists approval_status text not null default 'pending'
  check (approval_status in ('pending', 'approved', 'rejected'));

create table if not exists public.chef_documents (
  id uuid primary key default gen_random_uuid(),
  chef_id uuid not null references public.chefs (id) on delete cascade,
  kind text not null check (kind in ('cin_front', 'cin_back', 'auto_entrepreneur')),
  storage_path text not null,
  content_type text not null,
  created_at timestamptz not null default now(),
  constraint chef_documents_chef_kind_key unique (chef_id, kind)
);

insert into storage.buckets (id, name, public)
values ('chef-documents', 'chef-documents', false)
on conflict (id) do nothing;

-- REVIEW REQUIRED BEFORE APPLYING. Human must approve.
create or replace function public.approve_chef(p_chef_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_status is distinct from 'approved' and p_status is distinct from 'rejected' then
    raise exception 'Choose approve or reject';
  end if;
  if not public.is_admin() then
    raise exception 'Only the platform desk can review a kitchen';
  end if;
  update public.chefs
  set approval_status = p_status
  where id = p_chef_id;
  if not found then
    raise exception 'That kitchen could not be found';
  end if;
end;
$$;
