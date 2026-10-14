-- CreatorMarket — creator payouts + platform commission tracking.
-- Run after 0001. Safe to re-run.

-- Creator payout details (bank / UPI). Used to onboard each creator as a
-- Cashfree vendor when Easy Split is enabled.
create table if not exists public.creator_payouts (
  creator_id uuid primary key references auth.users(id) on delete cascade,
  method text not null default 'upi' check (method in ('upi','bank')),
  account_name text,
  account_number text,
  ifsc text,
  upi_vpa text,
  phone text,
  cashfree_vendor_id text,          -- filled once the creator is added as a Cashfree vendor
  updated_at timestamptz not null default now()
);

alter table public.creator_payouts enable row level security;
drop policy if exists "Creators manage own payout details" on public.creator_payouts;
create policy "Creators manage own payout details" on public.creator_payouts
  for all using (auth.uid() = creator_id) with check (auth.uid() = creator_id);

-- Commission columns on orders.
alter table public.orders add column if not exists commission_percent numeric(5,2);
alter table public.orders add column if not exists commission_amount numeric(10,2);
alter table public.orders add column if not exists creator_payout numeric(10,2);
alter table public.orders add column if not exists vendor_id text;

create index if not exists idx_orders_kind_status on public.orders(kind, status);
