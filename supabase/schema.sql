-- App Finanzas - esquema inicial privado por usuario.
-- Pega este archivo en Supabase SQL Editor y ejecútalo una sola vez.

create extension if not exists pgcrypto;

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  type text not null check (type in ('income', 'expense')),
  amount numeric(14, 2) not null check (amount > 0),
  category text not null,
  account text not null default 'Principal',
  note text,
  recurring_transaction_id uuid,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.transactions
  add column if not exists recurring_transaction_id uuid;

create index if not exists transactions_user_occurred_idx
  on public.transactions (user_id, occurred_at desc);

create index if not exists transactions_user_recurring_idx
  on public.transactions (user_id, recurring_transaction_id, occurred_at desc)
  where recurring_transaction_id is not null;

alter table public.transactions enable row level security;

drop policy if exists "Users can read their own transactions" on public.transactions;
create policy "Users can read their own transactions"
  on public.transactions
  for select
  to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = user_id);

drop policy if exists "Users can insert their own transactions" on public.transactions;
create policy "Users can insert their own transactions"
  on public.transactions
  for insert
  to authenticated
  with check ((select auth.uid()) is not null and (select auth.uid()) = user_id);

drop policy if exists "Users can update their own transactions" on public.transactions;
create policy "Users can update their own transactions"
  on public.transactions
  for update
  to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = user_id)
  with check ((select auth.uid()) is not null and (select auth.uid()) = user_id);

drop policy if exists "Users can delete their own transactions" on public.transactions;
create policy "Users can delete their own transactions"
  on public.transactions
  for delete
  to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = user_id);

create table if not exists public.monthly_budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  month date not null,
  amount numeric(14, 2) not null check (amount >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, month)
);

create index if not exists monthly_budgets_user_month_idx
  on public.monthly_budgets (user_id, month desc);

alter table public.monthly_budgets enable row level security;

drop policy if exists "Users can read their own budgets" on public.monthly_budgets;
create policy "Users can read their own budgets"
  on public.monthly_budgets
  for select
  to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = user_id);

drop policy if exists "Users can insert their own budgets" on public.monthly_budgets;
create policy "Users can insert their own budgets"
  on public.monthly_budgets
  for insert
  to authenticated
  with check ((select auth.uid()) is not null and (select auth.uid()) = user_id);

drop policy if exists "Users can update their own budgets" on public.monthly_budgets;
create policy "Users can update their own budgets"
  on public.monthly_budgets
  for update
  to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = user_id)
  with check ((select auth.uid()) is not null and (select auth.uid()) = user_id);

create table if not exists public.savings_boxes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  target_amount numeric(14, 2) not null check (target_amount > 0),
  current_amount numeric(14, 2) not null default 0 check (current_amount >= 0),
  target_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.savings_boxes
  add column if not exists target_date date;

create index if not exists savings_boxes_user_created_idx
  on public.savings_boxes (user_id, created_at desc);

alter table public.savings_boxes enable row level security;

drop policy if exists "Users can read their own savings boxes" on public.savings_boxes;
create policy "Users can read their own savings boxes"
  on public.savings_boxes
  for select
  to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = user_id);

drop policy if exists "Users can insert their own savings boxes" on public.savings_boxes;
create policy "Users can insert their own savings boxes"
  on public.savings_boxes
  for insert
  to authenticated
  with check ((select auth.uid()) is not null and (select auth.uid()) = user_id);

drop policy if exists "Users can update their own savings boxes" on public.savings_boxes;
create policy "Users can update their own savings boxes"
  on public.savings_boxes
  for update
  to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = user_id)
  with check ((select auth.uid()) is not null and (select auth.uid()) = user_id);

drop policy if exists "Users can delete their own savings boxes" on public.savings_boxes;
create policy "Users can delete their own savings boxes"
  on public.savings_boxes
  for delete
  to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = user_id);

create table if not exists public.savings_movements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  savings_box_id uuid not null references public.savings_boxes(id) on delete cascade,
  type text not null check (type in ('deposit', 'withdraw')),
  amount numeric(14, 2) not null check (amount > 0),
  note text,
  created_at timestamptz not null default now()
);

create index if not exists savings_movements_box_created_idx
  on public.savings_movements (savings_box_id, created_at desc);

alter table public.savings_movements enable row level security;

drop policy if exists "Users can read their own savings movements" on public.savings_movements;
create policy "Users can read their own savings movements"
  on public.savings_movements
  for select
  to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = user_id);

drop policy if exists "Users can insert their own savings movements" on public.savings_movements;
create policy "Users can insert their own savings movements"
  on public.savings_movements
  for insert
  to authenticated
  with check (
    (select auth.uid()) is not null
    and (select auth.uid()) = user_id
    and exists (
      select 1
      from public.savings_boxes box
      where box.id = savings_box_id
        and box.user_id = (select auth.uid())
    )
  );

drop policy if exists "Users can delete their own savings movements" on public.savings_movements;
create policy "Users can delete their own savings movements"
  on public.savings_movements
  for delete
  to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = user_id);

create table if not exists public.category_budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  month date not null,
  category text not null,
  amount numeric(14, 2) not null check (amount >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, month, category)
);

create index if not exists category_budgets_user_month_idx
  on public.category_budgets (user_id, month desc);

alter table public.category_budgets enable row level security;

drop policy if exists "Users can read their own category budgets" on public.category_budgets;
create policy "Users can read their own category budgets"
  on public.category_budgets
  for select
  to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = user_id);

drop policy if exists "Users can insert their own category budgets" on public.category_budgets;
create policy "Users can insert their own category budgets"
  on public.category_budgets
  for insert
  to authenticated
  with check ((select auth.uid()) is not null and (select auth.uid()) = user_id);

drop policy if exists "Users can update their own category budgets" on public.category_budgets;
create policy "Users can update their own category budgets"
  on public.category_budgets
  for update
  to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = user_id)
  with check ((select auth.uid()) is not null and (select auth.uid()) = user_id);

drop policy if exists "Users can delete their own category budgets" on public.category_budgets;
create policy "Users can delete their own category budgets"
  on public.category_budgets
  for delete
  to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = user_id);

create table if not exists public.recurring_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  type text not null check (type in ('income', 'expense')),
  amount numeric(14, 2) not null check (amount > 0),
  category text not null,
  account text not null default 'Principal',
  note text,
  day_of_month integer not null default 1 check (day_of_month between 1 and 31),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists recurring_transactions_user_created_idx
  on public.recurring_transactions (user_id, created_at desc);

alter table public.recurring_transactions enable row level security;

drop policy if exists "Users can read their own recurring transactions" on public.recurring_transactions;
create policy "Users can read their own recurring transactions"
  on public.recurring_transactions
  for select
  to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = user_id);

drop policy if exists "Users can insert their own recurring transactions" on public.recurring_transactions;
create policy "Users can insert their own recurring transactions"
  on public.recurring_transactions
  for insert
  to authenticated
  with check ((select auth.uid()) is not null and (select auth.uid()) = user_id);

drop policy if exists "Users can update their own recurring transactions" on public.recurring_transactions;
create policy "Users can update their own recurring transactions"
  on public.recurring_transactions
  for update
  to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = user_id)
  with check ((select auth.uid()) is not null and (select auth.uid()) = user_id);

drop policy if exists "Users can delete their own recurring transactions" on public.recurring_transactions;
create policy "Users can delete their own recurring transactions"
  on public.recurring_transactions
  for delete
  to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = user_id);
