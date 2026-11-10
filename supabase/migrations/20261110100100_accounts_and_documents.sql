-- Accounts, driver verification files, and a private storage bucket.
-- Apply only after 20261110100000_vehicle_bike.sql has committed.
-- Documents stay private. Admins read them. Drivers upload only into their own folder.
-- Checkout remains cash on delivery. This file does not charge a wallet.

alter table public.drivers
  add column if not exists email text not null default '';

create table if not exists public.driver_documents (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references public.drivers (id) on delete cascade,
  kind text not null check (kind in ('cin_front', 'cin_back', 'license', 'vehicle_papers')),
  storage_path text not null,
  content_type text not null,
  created_at timestamptz not null default now(),
  constraint driver_documents_driver_kind_key unique (driver_id, kind)
);

alter table public.driver_documents enable row level security;

drop policy if exists driver_documents_select on public.driver_documents;
create policy driver_documents_select on public.driver_documents
  for select to authenticated
  using (
    public.is_admin()
    or exists (
      select 1 from public.drivers as d
      where d.id = driver_id and d.profile_id = auth.uid()
    )
  );

drop policy if exists driver_documents_insert on public.driver_documents;
create policy driver_documents_insert on public.driver_documents
  for insert to authenticated
  with check (
    exists (
      select 1 from public.drivers as d
      where d.id = driver_id and d.profile_id = auth.uid()
    )
  );

drop policy if exists driver_documents_update on public.driver_documents;
create policy driver_documents_update on public.driver_documents
  for update to authenticated
  using (
    exists (
      select 1 from public.drivers as d
      where d.id = driver_id and d.profile_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.drivers as d
      where d.id = driver_id and d.profile_id = auth.uid()
    )
  );

grant select, insert, update on public.driver_documents to authenticated;

insert into storage.buckets (id, name, public)
values ('driver-documents', 'driver-documents', false)
on conflict (id) do nothing;

drop policy if exists driver_documents_upload on storage.objects;
create policy driver_documents_upload on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'driver-documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists driver_documents_admin_read on storage.objects;
create policy driver_documents_admin_read on storage.objects
  for select to authenticated
  using (bucket_id = 'driver-documents' and public.is_admin());

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = auth.uid() and role = 'customer')
  with check (id = auth.uid() and role = 'customer');

grant update (full_name, phone) on public.profiles to authenticated;

drop policy if exists orders_select_own_phone on public.orders;
create policy orders_select_own_phone on public.orders
  for select to authenticated
  using (
    regexp_replace(customer_phone, '\D', '', 'g') = regexp_replace(
      coalesce((select phone from public.profiles where id = auth.uid()), ''),
      '\D',
      '',
      'g'
    )
    and length(regexp_replace(coalesce((select phone from public.profiles where id = auth.uid()), ''), '\D', '', 'g')) >= 8
  );

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  requested text := coalesce(new.raw_user_meta_data ->> 'role', '');
  resolved public.user_role := 'customer';
  display_name text := coalesce(
    nullif(new.raw_user_meta_data ->> 'full_name', ''),
    split_part(coalesce(new.email, 'kitchen'), '@', 1)
  );
  v_phone text := regexp_replace(coalesce(new.raw_user_meta_data ->> 'phone', ''), '\D', '', 'g');
  v_city text := trim(coalesce(new.raw_user_meta_data ->> 'city', ''));
  v_vehicle text := coalesce(new.raw_user_meta_data ->> 'vehicle', '');
  v_kitchen text := coalesce(nullif(trim(new.raw_user_meta_data ->> 'kitchen_name'), ''), display_name);
begin
  if requested = 'chef' then
    resolved := 'chef';
  elsif requested = 'driver' then
    resolved := 'driver';
  end if;

  insert into public.profiles (id, email, full_name, phone, role)
  values (new.id, new.email, display_name, nullif(v_phone, ''), resolved)
  on conflict (id) do nothing;

  if resolved = 'chef' then
    insert into public.chefs (profile_id, kitchen_name, city)
    values (new.id, v_kitchen, coalesce(nullif(v_city, ''), 'Casablanca'))
    on conflict (profile_id) do nothing;
  end if;

  if resolved = 'driver' then
    if length(v_phone) < 8 or length(v_phone) > 15 or length(v_city) < 2 then
      raise exception 'Driver application is incomplete';
    end if;
    if v_vehicle not in ('bike', 'motorbike', 'car') then
      raise exception 'Driver application is incomplete';
    end if;
    if exists (select 1 from public.drivers where phone = v_phone) then
      raise exception 'That phone is already registered';
    end if;
    insert into public.drivers (profile_id, full_name, phone, city, vehicle, email)
    values (new.id, display_name, v_phone, v_city, v_vehicle::public.vehicle_type, coalesce(new.email, ''));
  end if;

  return new;
end;
$$;

create or replace function public.auth_email_for_phone(p_phone text)
returns text
language sql
security definer
set search_path = public
as $$
  select found.email
  from (
    select p.email
    from public.drivers as d
    join public.profiles as p on p.id = d.profile_id
    where d.phone = regexp_replace(coalesce(p_phone, ''), '\D', '', 'g')
    union all
    select p.email
    from public.profiles as p
    where p.phone = regexp_replace(coalesce(p_phone, ''), '\D', '', 'g')
      and p.role = 'customer'
  ) as found
  limit 1;
$$;

revoke all on function public.auth_email_for_phone(text) from public;
grant execute on function public.auth_email_for_phone(text) to anon, authenticated;

create or replace function public.complete_staff_signup(
  p_role text,
  p_full_name text,
  p_phone text,
  p_city text,
  p_vehicle text,
  p_kitchen text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles;
  v_phone text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
begin
  select * into v_profile from public.profiles where id = auth.uid();
  if v_profile.id is null then
    raise exception 'Sign in to continue';
  end if;
  if v_profile.role = 'admin' or v_profile.role = 'driver' or (v_profile.role = 'chef' and p_role <> 'chef') then
    raise exception 'That status change is not allowed';
  end if;

  if p_role = 'chef' then
    update public.profiles
      set role = 'chef',
          full_name = coalesce(nullif(trim(p_full_name), ''), full_name),
          phone = coalesce(nullif(v_phone, ''), phone)
      where id = v_profile.id;
    insert into public.chefs (profile_id, kitchen_name, city)
    values (
      v_profile.id,
      coalesce(nullif(trim(p_kitchen), ''), 'Kitchen'),
      coalesce(nullif(trim(p_city), ''), 'Casablanca')
    )
    on conflict (profile_id) do nothing;
  elsif p_role = 'driver' then
    if length(v_phone) < 8 or p_vehicle not in ('bike', 'motorbike', 'car') or length(trim(coalesce(p_city, ''))) < 2 then
      raise exception 'Driver application is incomplete';
    end if;
    update public.profiles
      set role = 'driver',
          full_name = coalesce(nullif(trim(p_full_name), ''), full_name),
          phone = v_phone
      where id = v_profile.id;
    insert into public.drivers (profile_id, full_name, phone, city, vehicle, email)
    values (
      v_profile.id,
      coalesce(nullif(trim(p_full_name), ''), v_profile.full_name),
      v_phone,
      trim(p_city),
      p_vehicle::public.vehicle_type,
      v_profile.email
    );
  else
    raise exception 'Choose the chef kitchen or the driver route';
  end if;
end;
$$;

revoke all on function public.complete_staff_signup(text, text, text, text, text, text) from public;
grant execute on function public.complete_staff_signup(text, text, text, text, text, text) to authenticated;
