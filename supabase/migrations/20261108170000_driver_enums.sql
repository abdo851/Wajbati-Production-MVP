-- Run this file on its own and let it commit before the next migration.
-- PostgreSQL cannot use a new enum value in the same transaction that adds it.

alter type public.user_role add value if not exists 'driver';
alter type public.order_status add value if not exists 'assigned';
alter type public.order_status add value if not exists 'picked_up';
