-- Wajbati schema
-- Apply in the Supabase SQL editor, or with the Supabase CLI.
-- Commission on new orders is 3 MAD per portion. Keep this aligned with
-- PLATFORM_COMMISSION_MAD in src/lib/constants.ts.
-- Public sign-up metadata may request the chef role. It can never grant admin.
-- After creating an admin in Authentication, run:
--   update public.profiles set role = 'admin' where id = '<user-uuid>';
-- After creating a chef, link a kitchen:
--   insert into public.chefs (profile_id, kitchen_name, city, bio)
--   values ('<user-uuid>', 'Dar Fatima', 'Casablanca', 'Home kitchen');

create extension if not exists pgcrypto;

do $$ begin
  create type public.user_role as enum ('customer', 'chef', 'admin');
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type public.order_status as enum ('pending', 'confirmed', 'delivered', 'cancelled');
exception
  when duplicate_object then null;
end $$;

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text unique,
  full_name text not null,
  phone text,
  role public.user_role not null default 'customer',
  created_at timestamptz not null default now()
);

create table if not exists public.chefs (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null unique references public.profiles (id) on delete cascade,
  kitchen_name text not null,
  bio text not null default '',
  city text not null default '',
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.meals (
  id uuid primary key default gen_random_uuid(),
  chef_id uuid not null references public.chefs (id) on delete restrict,
  title text not null,
  description text not null default '',
  price_mad numeric(10, 2) not null check (price_mad > 0),
  max_quantity integer not null check (max_quantity > 0),
  remaining_quantity integer not null check (remaining_quantity >= 0),
  service_date date not null default ((timezone('Africa/Casablanca', now()))::date),
  is_published boolean not null default true,
  created_at timestamptz not null default now(),
  constraint meals_remaining_within_max check (remaining_quantity <= max_quantity)
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  meal_id uuid not null references public.meals (id) on delete restrict,
  chef_id uuid not null references public.chefs (id) on delete restrict,
  customer_name text not null,
  customer_phone text not null,
  delivery_address text not null,
  quantity integer not null check (quantity > 0),
  unit_price_mad numeric(10, 2) not null check (unit_price_mad >= 0),
  commission_per_meal_mad numeric(10, 2) not null default 3 check (commission_per_meal_mad >= 0),
  total_mad numeric(10, 2) not null check (total_mad >= 0),
  commission_mad numeric(10, 2) not null check (commission_mad >= 0),
  status public.order_status not null default 'pending',
  created_at timestamptz not null default now()
);

create index if not exists meals_today_idx
  on public.meals (service_date, is_published);

create index if not exists orders_chef_created_idx
  on public.orders (chef_id, created_at desc);

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'admin'
  );
$$;

create or replace function public.is_chef_owner(target_chef uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.chefs
    where id = target_chef
      and profile_id = auth.uid()
  );
$$;

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
begin
  if requested = 'chef' then
    resolved := 'chef';
  end if;

  insert into public.profiles (id, email, full_name, role)
  values (new.id, new.email, display_name, resolved)
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Decrements stock only when enough portions remain. The update and insert
-- share one transaction, so a failed insert puts the portions back.
create or replace function public.place_order(
  p_meal_id uuid,
  p_customer_name text,
  p_customer_phone text,
  p_delivery_address text,
  p_quantity integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_meal public.meals;
  v_order public.orders;
  v_kitchen text;
  v_commission numeric(10, 2) := 3;
begin
  if p_quantity is null or p_quantity < 1 or p_quantity > 20 then
    raise exception 'Quantity must be a whole number from 1 to 20';
  end if;
  if length(trim(coalesce(p_customer_name, ''))) < 2 then
    raise exception 'Name is required';
  end if;
  if length(regexp_replace(coalesce(p_customer_phone, ''), '\D', '', 'g')) < 8 then
    raise exception 'Enter a valid phone number';
  end if;
  if length(trim(coalesce(p_delivery_address, ''))) < 4 then
    raise exception 'Delivery address is required';
  end if;

  update public.meals as m
  set remaining_quantity = m.remaining_quantity - p_quantity
  where m.id = p_meal_id
    and m.is_published
    and m.service_date = (timezone('Africa/Casablanca', now()))::date
    and m.remaining_quantity >= p_quantity
    and exists (
      select 1
      from public.chefs as c
      where c.id = m.chef_id
        and c.is_active
    )
  returning * into v_meal;

  if not found then
    raise exception 'Not enough portions left';
  end if;

  select kitchen_name into v_kitchen
  from public.chefs
  where id = v_meal.chef_id;

  insert into public.orders (
    meal_id,
    chef_id,
    customer_name,
    customer_phone,
    delivery_address,
    quantity,
    unit_price_mad,
    commission_per_meal_mad,
    total_mad,
    commission_mad
  )
  values (
    v_meal.id,
    v_meal.chef_id,
    trim(p_customer_name),
    trim(p_customer_phone),
    trim(p_delivery_address),
    p_quantity,
    v_meal.price_mad,
    v_commission,
    round(v_meal.price_mad * p_quantity, 2),
    round(v_commission * p_quantity, 2)
  )
  returning * into v_order;

  return jsonb_build_object(
    'id', v_order.id,
    'mealTitle', v_meal.title,
    'kitchenName', v_kitchen,
    'customerName', v_order.customer_name,
    'deliveryAddress', v_order.delivery_address,
    'quantity', v_order.quantity,
    'unitPriceMad', v_order.unit_price_mad,
    'totalMad', v_order.total_mad,
    'createdAt', v_order.created_at
  );
end;
$$;

create or replace function public.guard_meal_update()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.chef_id is distinct from old.chef_id then
    raise exception 'chef_id is immutable';
  end if;
  return new;
end;
$$;

drop trigger if exists meals_guard_update on public.meals;
create trigger meals_guard_update
  before update on public.meals
  for each row execute function public.guard_meal_update();

create or replace function public.guard_order_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.meal_id is distinct from old.meal_id
     or new.chef_id is distinct from old.chef_id
     or new.customer_name is distinct from old.customer_name
     or new.customer_phone is distinct from old.customer_phone
     or new.delivery_address is distinct from old.delivery_address
     or new.quantity is distinct from old.quantity
     or new.unit_price_mad is distinct from old.unit_price_mad
     or new.commission_per_meal_mad is distinct from old.commission_per_meal_mad
     or new.total_mad is distinct from old.total_mad
     or new.commission_mad is distinct from old.commission_mad
     or new.created_at is distinct from old.created_at
  then
    raise exception 'Only order status can be updated';
  end if;

  if old.status in ('delivered', 'cancelled') and new.status is distinct from old.status then
    raise exception 'That status change is not allowed';
  end if;
  if old.status = 'confirmed' and new.status = 'pending' then
    raise exception 'That status change is not allowed';
  end if;
  if old.status = 'pending' and new.status = 'delivered' then
    raise exception 'That status change is not allowed';
  end if;

  if new.status = 'cancelled' and old.status is distinct from 'cancelled' then
    update public.meals
    set remaining_quantity = least(max_quantity, remaining_quantity + old.quantity)
    where id = old.meal_id;
  end if;

  return new;
end;
$$;

drop trigger if exists orders_guard_update on public.orders;
create trigger orders_guard_update
  before update on public.orders
  for each row execute function public.guard_order_update();

alter table public.profiles enable row level security;
alter table public.chefs enable row level security;
alter table public.meals enable row level security;
alter table public.orders enable row level security;

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.is_admin());

drop policy if exists chefs_select on public.chefs;
create policy chefs_select on public.chefs
  for select to anon, authenticated
  using (is_active or profile_id = auth.uid() or public.is_admin());

drop policy if exists meals_select on public.meals;
create policy meals_select on public.meals
  for select to anon, authenticated
  using (
    (is_published and service_date = (timezone('Africa/Casablanca', now()))::date)
    or public.is_chef_owner(chef_id)
    or public.is_admin()
  );

drop policy if exists meals_insert on public.meals;
create policy meals_insert on public.meals
  for insert to authenticated
  with check (public.is_chef_owner(chef_id));

drop policy if exists meals_update on public.meals;
create policy meals_update on public.meals
  for update to authenticated
  using (public.is_chef_owner(chef_id))
  with check (public.is_chef_owner(chef_id));

drop policy if exists orders_select on public.orders;
create policy orders_select on public.orders
  for select to authenticated
  using (public.is_chef_owner(chef_id) or public.is_admin());

drop policy if exists orders_update on public.orders;
create policy orders_update on public.orders
  for update to authenticated
  using (public.is_chef_owner(chef_id))
  with check (public.is_chef_owner(chef_id));

revoke all on function public.is_admin() from public;
revoke all on function public.is_chef_owner(uuid) from public;
revoke all on function public.place_order(uuid, text, text, text, integer) from public;
grant execute on function public.is_admin() to anon, authenticated;
grant execute on function public.is_chef_owner(uuid) to anon, authenticated;
grant execute on function public.place_order(uuid, text, text, text, integer) to anon, authenticated;

grant select on public.profiles to authenticated;
grant select on public.chefs to anon, authenticated;
grant select on public.meals to anon, authenticated;
grant insert, update on public.meals to authenticated;
grant select, update on public.orders to authenticated;
revoke insert, delete on public.orders from anon, authenticated;
