-- Per-user finance records. Each domain has its own table so the data can
-- evolve independently while retaining the existing v1 JSON object shape.
create table if not exists public.transactions (
  id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  data jsonb not null,
  primary key (user_id, id)
);

create table if not exists public.budgets (
  id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  data jsonb not null,
  primary key (user_id, id)
);

create table if not exists public.accounts (
  id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  data jsonb not null,
  primary key (user_id, id)
);

create table if not exists public.categories (
  id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  data jsonb not null,
  primary key (user_id, id)
);

create table if not exists public.investments (
  id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  data jsonb not null,
  primary key (user_id, id)
);

create table if not exists public.recurring_rules (
  id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  data jsonb not null,
  primary key (user_id, id)
);

create table if not exists public.savings_buckets (
  id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  data jsonb not null,
  primary key (user_id, id)
);

create table if not exists public.debts (
  id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  data jsonb not null,
  primary key (user_id, id)
);

create table if not exists public.credit_score_history (
  id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  data jsonb not null,
  primary key (user_id, id)
);

create table if not exists public.finance_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb
);

alter table public.transactions enable row level security;
alter table public.budgets enable row level security;
alter table public.accounts enable row level security;
alter table public.categories enable row level security;
alter table public.investments enable row level security;
alter table public.recurring_rules enable row level security;
alter table public.savings_buckets enable row level security;
alter table public.debts enable row level security;
alter table public.credit_score_history enable row level security;
alter table public.finance_preferences enable row level security;

grant select, insert, update, delete on public.transactions, public.budgets,
  public.accounts, public.categories, public.investments, public.recurring_rules,
  public.savings_buckets, public.debts, public.credit_score_history,
  public.finance_preferences to authenticated;

do $$
declare
  domain_table text;
begin
  foreach domain_table in array array[
    'transactions', 'budgets', 'accounts', 'categories', 'investments',
    'recurring_rules', 'savings_buckets', 'debts', 'credit_score_history'
  ]
  loop
    execute format(
      'create policy "Users manage their own %1$s" on public.%1$I for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id)',
      domain_table
    );
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = domain_table
    ) then
      execute format('alter publication supabase_realtime add table public.%I', domain_table);
    end if;
  end loop;
end $$;

create policy "Users manage their own finance preferences"
  on public.finance_preferences for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'finance_preferences'
  ) then
    alter publication supabase_realtime add table public.finance_preferences;
  end if;
end $$;
