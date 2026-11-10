-- Delivery verification code and private tracking token.
-- Cash on delivery stays the live payment path.
-- The code is returned only by place_order and track_order. Drivers submit it to finish a trip.

alter table public.orders
  add column if not exists delivery_code text,
  add column if not exists track_token text;

update public.orders
set
  delivery_code = lpad((floor(random() * 10000))::int::text, 4, '0'),
  track_token = encode(gen_random_bytes(24), 'hex')
where delivery_code is null
   or track_token is null
   or delivery_code !~ '^[0-9]{4}$';

alter table public.orders
  alter column delivery_code set not null,
  alter column track_token set not null;

create unique index if not exists orders_track_token_key on public.orders (track_token);

do $$ begin
  alter table public.orders
    add constraint orders_delivery_code_digits check (delivery_code ~ '^[0-9]{4}$');
exception
  when duplicate_object then null;
end $$;

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
  v_bytes bytea := gen_random_bytes(2);
  v_code text := lpad((mod(get_byte(v_bytes, 0)::int * 256 + get_byte(v_bytes, 1)::int, 10000))::text, 4, '0');
  v_token text := encode(gen_random_bytes(24), 'hex');
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
      select 1 from public.chefs as c
      where c.id = m.chef_id and c.is_active
    )
  returning * into v_meal;

  if not found then
    raise exception 'Not enough portions left';
  end if;

  select kitchen_name into v_kitchen from public.chefs where id = v_meal.chef_id;

  insert into public.orders (
    meal_id, chef_id, customer_name, customer_phone, delivery_address, customer_notes,
    quantity, unit_price_mad, commission_per_meal_mad, total_mad, commission_mad,
    payment_method, payment_status, delivery_code, track_token
  )
  values (
    v_meal.id, v_meal.chef_id, trim(p_customer_name), trim(p_customer_phone), trim(p_delivery_address), v_notes,
    p_quantity, v_meal.price_mad, v_commission, round(v_meal.price_mad * p_quantity, 2), round(v_commission * p_quantity, 2),
    'cash', 'due_on_delivery', v_code, v_token
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
    'deliveryCode', v_order.delivery_code,
    'trackToken', v_order.track_token,
    'createdAt', v_order.created_at
  );
end;
$$;

create or replace function public.track_order(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders;
  v_title text;
  v_kitchen text;
begin
  if p_token is null or length(p_token) < 20 then
    raise exception 'That order could not be found';
  end if;

  select * into v_order from public.orders where track_token = p_token;
  if not found then
    raise exception 'That order could not be found';
  end if;

  select title into v_title from public.meals where id = v_order.meal_id;
  select kitchen_name into v_kitchen from public.chefs where id = v_order.chef_id;

  return jsonb_build_object(
    'mealTitle', coalesce(v_title, 'Meal'),
    'kitchenName', coalesce(v_kitchen, 'Kitchen'),
    'deliveryAddress', v_order.delivery_address,
    'quantity', v_order.quantity,
    'totalMad', v_order.total_mad,
    'deliveryFeeMad', v_order.delivery_fee_mad,
    'customerNotes', v_order.customer_notes,
    'status', v_order.status,
    'deliveryCode', v_order.delivery_code,
    'createdAt', v_order.created_at
  );
end;
$$;

drop function if exists public.advance_delivery(uuid, text);

create function public.advance_delivery(p_order_id uuid, p_action text, p_code text default '')
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_driver_id uuid;
  v_status public.order_status;
  v_code text;
  v_owner uuid;
  v_id uuid;
begin
  select id into v_driver_id from public.drivers where profile_id = auth.uid();
  if v_driver_id is null then
    raise exception 'That driver could not be found';
  end if;

  select status, delivery_code, driver_id into v_status, v_code, v_owner
  from public.orders
  where id = p_order_id;

  if v_owner is distinct from v_driver_id then
    raise exception 'That status change is not allowed';
  end if;

  if p_action = 'pick_up' then
    update public.orders
    set status = 'picked_up'
    where id = p_order_id and driver_id = v_driver_id and status = 'assigned'
    returning id into v_id;
  elsif p_action = 'deliver' then
    if v_status <> 'picked_up' then
      raise exception 'That status change is not allowed';
    end if;
    if p_code is null or p_code !~ '^[0-9]{4}$' or p_code is distinct from v_code then
      raise exception 'That code does not match';
    end if;
    update public.orders
    set status = 'delivered'
    where id = p_order_id and driver_id = v_driver_id and status = 'picked_up' and delivery_code = p_code
    returning id into v_id;
  elsif p_action = 'release' then
    update public.orders
    set status = 'confirmed', driver_id = null
    where id = p_order_id and driver_id = v_driver_id and status = 'assigned'
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
     or new.delivery_code is distinct from old.delivery_code
     or new.track_token is distinct from old.track_token
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
      select 1 from public.drivers as d
      where d.id = old.driver_id and d.profile_id = auth.uid()
    ) then
      raise exception 'That status change is not allowed';
    end if;
  end if;

  if new.status in ('picked_up', 'delivered') then
    if new.driver_id is distinct from old.driver_id or not exists (
      select 1 from public.drivers as d
      where d.id = new.driver_id and d.profile_id = auth.uid() and d.status = 'approved'
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

revoke all on function public.track_order(text) from public;
revoke all on function public.advance_delivery(uuid, text, text) from public;
grant execute on function public.track_order(text) to anon, authenticated;
grant execute on function public.advance_delivery(uuid, text, text) to authenticated;
