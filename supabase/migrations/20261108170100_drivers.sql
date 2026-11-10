-- Drivers, delivery fees, and the trip lock.
-- Apply only after 20261108170000_driver_enums.sql has committed.
-- Driver sign-up uses Auth with role "driver". It can never grant admin.
-- Turn email confirmations off so a phone application can sign in immediately.
-- Delivery fee default is 15 MAD. Driver commission default is 3 MAD per trip.
-- Keep both aligned with DELIVERY_FEE_MAD and DRIVER_COMMISSION_MAD.

do $$ begin
  create type public.driver_account_status as enum ('pending', 'approved', 'rejected');
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type public.vehicle_type as enum ('motorbike', 'car');
exception
  when duplicate_object then null;
end $$;

create table if not exists public.drivers (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null unique references public.profiles (id) on delete cascade,
  full_name text not null,
  phone text not null,
  city text not null,
  vehicle public.vehicle_type not null,
  status public.driver_account_status not null default 'pending',
  created_at timestamptz not null default now(),
  constraint drivers_phone_digits check (phone ~ '^[0-9]{8,15}$')
);

create unique index if not exists drivers_phone_key on public.drivers (phone);

alter table public.orders
  add column if not exists driver_id uuid references public.drivers (id) on delete set null,
  add column if not exists delivery_fee_mad numeric(10, 2) not null default 15 check (delivery_fee_mad >= 0),
  add column if not exists driver_commission_mad numeric(10, 2) not null default 3 check (driver_commission_mad >= 0);

create index if not exists orders_driver_idx on public.orders (driver_id, status);

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
begin
  if requested = 'chef' then
    resolved := 'chef';
  elsif requested = 'driver' then
    resolved := 'driver';
  end if;

  insert into public.profiles (id, email, full_name, phone, role)
  values (new.id, new.email, display_name, nullif(v_phone, ''), resolved)
  on conflict (id) do nothing;

  if resolved = 'driver' then
    if length(v_phone) < 8 or length(v_phone) > 15 or length(v_city) < 2 then
      raise exception 'Driver application is incomplete';
    end if;
    if v_vehicle not in ('motorbike', 'car') then
      raise exception 'Driver application is incomplete';
    end if;
    if exists (select 1 from public.drivers where phone = v_phone) then
      raise exception 'That phone is already registered';
    end if;
    insert into public.drivers (profile_id, full_name, phone, city, vehicle)
    values (new.id, display_name, v_phone, v_city, v_vehicle::public.vehicle_type);
  end if;

  return new;
end;
$$;

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
    'deliveryFeeMad', v_order.delivery_fee_mad,
    'createdAt', v_order.created_at
  );
end;
$$;

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
     or new.delivery_fee_mad is distinct from old.delivery_fee_mad
     or new.driver_commission_mad is distinct from old.driver_commission_mad
     or new.created_at is distinct from old.created_at
  then
    raise exception 'Only order status can be updated';
  end if;

  if old.status in ('delivered', 'cancelled') and new.status is distinct from old.status then
    raise exception 'That status change is not allowed';
  end if;

  if new.driver_id is distinct from old.driver_id then
    if not (
      (old.status = 'confirmed' and new.status = 'assigned' and old.driver_id is null and new.driver_id is not null)
      or (old.status = 'assigned' and new.status = 'confirmed' and new.driver_id is null)
    ) then
      raise exception 'That status change is not allowed';
    end if;
  end if;

  if old.status = 'pending' and new.status not in ('pending', 'confirmed', 'cancelled') then
    raise exception 'That status change is not allowed';
  end if;
  if old.status = 'confirmed' and new.status not in ('confirmed', 'cancelled', 'assigned') then
    raise exception 'That status change is not allowed';
  end if;
  if old.status = 'assigned' and new.status not in ('assigned', 'picked_up', 'confirmed') then
    raise exception 'That status change is not allowed';
  end if;
  if old.status = 'picked_up' and new.status not in ('picked_up', 'delivered') then
    raise exception 'That status change is not allowed';
  end if;

  if new.status = 'assigned' then
    if not exists (
      select 1
      from public.drivers as d
      join public.chefs as c on c.id = old.chef_id
      where d.id = new.driver_id
        and d.profile_id = auth.uid()
        and d.status = 'approved'
        and d.city = c.city
    ) then
      raise exception 'That driver cannot take this order';
    end if;
  end if;

  if new.status = 'confirmed' and old.status = 'assigned' then
    if new.driver_id is not null or not exists (
      select 1
      from public.drivers as d
      where d.id = old.driver_id
        and d.profile_id = auth.uid()
    ) then
      raise exception 'That status change is not allowed';
    end if;
  end if;

  if new.status in ('picked_up', 'delivered') then
    if new.driver_id is distinct from old.driver_id or not exists (
      select 1
      from public.drivers as d
      where d.id = new.driver_id
        and d.profile_id = auth.uid()
        and d.status = 'approved'
    ) then
      raise exception 'That status change is not allowed';
    end if;
    if new.status = 'picked_up' and old.status <> 'assigned' then
      raise exception 'That status change is not allowed';
    end if;
    if new.status = 'delivered' and old.status <> 'picked_up' then
      raise exception 'That status change is not allowed';
    end if;
  end if;

  if new.status = 'cancelled' and old.status is distinct from 'cancelled' then
    if old.status not in ('pending', 'confirmed')
       or not (public.is_chef_owner(old.chef_id) or public.is_admin()) then
      raise exception 'That status change is not allowed';
    end if;
    update public.meals
    set remaining_quantity = least(max_quantity, remaining_quantity + old.quantity)
    where id = old.meal_id;
  end if;

  return new;
end;
$$;

create or replace function public.accept_delivery(p_order_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_driver public.drivers;
  v_city text;
  v_id uuid;
begin
  select * into v_driver
  from public.drivers
  where profile_id = auth.uid();

  if not found then
    raise exception 'That driver could not be found';
  end if;
  if v_driver.status <> 'approved' then
    raise exception 'Your application is still waiting for approval';
  end if;

  select c.city into v_city
  from public.orders as o
  join public.chefs as c on c.id = o.chef_id
  where o.id = p_order_id;

  if v_city is null then
    raise exception 'That delivery could not be found';
  end if;
  if v_city is distinct from v_driver.city then
    raise exception 'That delivery is outside your zone';
  end if;

  update public.orders
  set status = 'assigned',
      driver_id = v_driver.id
  where id = p_order_id
    and status = 'confirmed'
    and driver_id is null
  returning id into v_id;

  if v_id is null then
    raise exception 'That delivery was just taken';
  end if;

  return v_id;
end;
$$;

create or replace function public.advance_delivery(p_order_id uuid, p_action text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_driver_id uuid;
  v_id uuid;
begin
  select id into v_driver_id
  from public.drivers
  where profile_id = auth.uid();

  if v_driver_id is null then
    raise exception 'That driver could not be found';
  end if;

  if p_action = 'pick_up' then
    update public.orders
    set status = 'picked_up'
    where id = p_order_id
      and driver_id = v_driver_id
      and status = 'assigned'
    returning id into v_id;
  elsif p_action = 'deliver' then
    update public.orders
    set status = 'delivered'
    where id = p_order_id
      and driver_id = v_driver_id
      and status = 'picked_up'
    returning id into v_id;
  elsif p_action = 'release' then
    update public.orders
    set status = 'confirmed',
        driver_id = null
    where id = p_order_id
      and driver_id = v_driver_id
      and status = 'assigned'
    returning id into v_id;
  else
    raise exception 'That status change is not allowed';
  end if;

  if v_id is null then
    raise exception 'That status change is not allowed';
  end if;

  return v_id;
end;
$$;

alter table public.drivers enable row level security;

drop policy if exists drivers_select on public.drivers;
create policy drivers_select on public.drivers
  for select to authenticated
  using (profile_id = auth.uid() or public.is_admin());

drop policy if exists drivers_update on public.drivers;
create policy drivers_update on public.drivers
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists orders_select on public.orders;
create policy orders_select on public.orders
  for select to authenticated
  using (
    public.is_admin()
    or public.is_chef_owner(chef_id)
    or exists (
      select 1
      from public.drivers as d
      join public.chefs as c on c.id = orders.chef_id
      where d.profile_id = auth.uid()
        and d.status = 'approved'
        and (
          orders.driver_id = d.id
          or (
            orders.status = 'confirmed'
            and orders.driver_id is null
            and d.city = c.city
          )
        )
    )
  );

revoke all on function public.accept_delivery(uuid) from public;
revoke all on function public.advance_delivery(uuid, text) from public;
grant execute on function public.accept_delivery(uuid) to authenticated;
grant execute on function public.advance_delivery(uuid, text) to authenticated;

grant select on public.drivers to authenticated;
grant update (status) on public.drivers to authenticated;
