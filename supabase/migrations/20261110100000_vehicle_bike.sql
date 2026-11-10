-- Apply this file on its own, then apply 20261110100100_accounts_and_documents.sql.
-- Postgres cannot use a new enum value in the same transaction that adds it.

alter type public.vehicle_type add value if not exists 'bike';
