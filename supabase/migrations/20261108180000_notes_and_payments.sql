-- Notes, optional contact email, and a cash-first payment shape.
-- Wallet rows exist so a later in-app balance can attach to a profile.
-- Checkout still records cash on delivery. Nothing is charged here.

do $$ begin
  create type public.payment_method as enum ('cash', 'wallet');
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type public.payment_status as enum ('unpaid', 'due_on_delivery', 'pending', 'paid');
exception
  when duplicate_object then null;
end $$;

alter table public.orders
  add column if not exists customer_notes text not null default '',
  add column if not exists customer_email text,
  add column if not exists payment_method public.payment_method not null default 'cash',
  add column if not exists payment_status public.payment_status not null default 'due_on_delivery';

create table if not exists public.wallets (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid unique references public.profiles (id) on delete cascade,
  phone text,
  balance_mad numeric(10, 2) not null default 0 check (balance_mad >= 0),
  currency text not null default 'MAD',
  created_at timestamptz not null default now()
);

alter table public.wallets enable row level security;

drop policy if exists wallets_select_own on public.wallets;
create policy wallets_select_own on public.wallets
  for select to authenticated
  using (profile_id = auth.uid() or public.is_admin());

grant select on public.wallets to authenticated;

drop function if exists public.place_order(uuid, text, text, text, integer);

create or replace function public.place_order(
  p_meal_id uuid,
  p_customer_name text,
  p_customer_phone text,
  p_delivery_address text,
  p_quantity integer,
  p_customer_notes text default ''
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
  v_notes text := left(trim(coalesce(p_customer_notes, '')), 280);
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
    customer_notes,
    quantity,
    unit_price_mad,
    commission_per_meal_mad,
    total_mad,
    commission_mad,
    payment_method,
    payment_status
  )
  values (
    v_meal.id,
    v_meal.chef_id,
    trim(p_customer_name),
    trim(p_customer_phone),
    trim(p_delivery_address),
    v_notes,
    p_quantity,
    v_meal.price_mad,
    v_commission,
    round(v_meal.price_mad * p_quantity, 2),
    round(v_commission * p_quantity, 2),
    'cash',
    'due_on_delivery'
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
    'customerNotes', v_order.customer_notes,
    'paymentMethod', v_order.payment_method,
    'paymentStatus', v_order.payment_status,
    'createdAt', v_order.created_at
  );
end;
$$;

create or replace function public.attach_order_email(p_order_id uuid, p_email text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_email is null or p_email !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'Enter a valid email';
  end if;

  update public.orders
  set customer_email = lower(trim(p_email))
  where id = p_order_id
    and customer_email is null;

  if not found then
    if not exists (select 1 from public.orders where id = p_order_id) then
      raise exception 'That order could not be found';
    end if;
  end if;
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
     or new.customer_notes is distinct from old.customer_notes
     or new.quantity is distinct from old.quantity
     or new.unit_price_mad is distinct from old.unit_price_mad
     or new.commission_per_meal_mad is distinct from old.commission_per_meal_mad
     or new.total_mad is distinct from old.total_mad
     or new.commission_mad is distinct from old.commission_mad
     or new.delivery_fee_mad is distinct from old.delivery_fee_mad
     or new.driver_commission_mad is distinct from old.driver_commission_mad
     or new.payment_method is distinct from old.payment_method
     or new.payment_status is distinct from old.payment_status
     or new.created_at is distinct from old.created_at
  then
    raise exception 'Only order status can be updated';
  end if;

  if new.customer_email is distinct from old.customer_email then
    if old.customer_email is not null or new.customer_email is null then
      raise exception 'Only order status can be updated';
    end if;
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

revoke all on function public.place_order(uuid, text, text, text, integer, text) from public;
revoke all on function public.attach_order_email(uuid, text) from public;
grant execute on function public.place_order(uuid, text, text, text, integer, text) to anon, authenticated;
grant execute on function public.attach_order_email(uuid, text) to anon, authenticated;
