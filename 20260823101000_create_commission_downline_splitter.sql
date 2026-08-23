create extension if not exists pgcrypto;

create table if not exists public.agents (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null default auth.uid(),
  name text not null,
  email text,
  phone text,
  default_agent_split_percent numeric(5,2) not null default 70 check (default_agent_split_percent >= 0 and default_agent_split_percent <= 100),
  default_upline_split_percent numeric(5,2) not null default 0 check (default_upline_split_percent >= 0 and default_upline_split_percent <= 100),
  upline_agent_id uuid references public.agents(id) on delete set null,
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sales (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null default auth.uid(),
  writing_agent_id uuid not null references public.agents(id) on delete restrict,
  upline_agent_id uuid references public.agents(id) on delete set null,
  client_name text not null,
  product_type text,
  carrier text,
  policy_number text,
  sale_date date not null default current_date,
  issue_date date,
  premium numeric(14,2) not null default 0 check (premium >= 0),
  commission_rate_percent numeric(7,4) not null default 0 check (commission_rate_percent >= 0),
  agent_split_percent numeric(5,2) not null default 70 check (agent_split_percent >= 0 and agent_split_percent <= 100),
  upline_split_percent numeric(5,2) not null default 0 check (upline_split_percent >= 0 and upline_split_percent <= 100),
  gross_commission numeric(14,2) generated always as (round((premium * commission_rate_percent / 100), 2)) stored,
  writing_agent_commission numeric(14,2) generated always as (round((premium * commission_rate_percent / 100) * agent_split_percent / 100, 2)) stored,
  upline_commission numeric(14,2) generated always as (round((premium * commission_rate_percent / 100) * upline_split_percent / 100, 2)) stored,
  house_commission numeric(14,2) generated always as (round((premium * commission_rate_percent / 100) - ((premium * commission_rate_percent / 100) * agent_split_percent / 100) - ((premium * commission_rate_percent / 100) * upline_split_percent / 100), 2)) stored,
  status text not null default 'unpaid' check (status in ('pending','unpaid','paid','chargeback','void')),
  paid_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint total_split_not_over_100 check ((agent_split_percent + upline_split_percent) <= 100)
);

create table if not exists public.payouts (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null default auth.uid(),
  payee_agent_id uuid not null references public.agents(id) on delete restrict,
  payout_date date not null default current_date,
  amount numeric(14,2) not null default 0 check (amount >= 0),
  method text not null default 'check' check (method in ('check','ach','wire','cash','other')),
  reference_number text,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.payout_items (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null default auth.uid(),
  payout_id uuid not null references public.payouts(id) on delete cascade,
  sale_id uuid not null references public.sales(id) on delete restrict,
  payee_agent_id uuid not null references public.agents(id) on delete restrict,
  role text not null check (role in ('writing_agent','upline')),
  amount numeric(14,2) not null check (amount >= 0),
  created_at timestamptz not null default now(),
  unique(payout_id, sale_id, payee_agent_id, role)
);

create or replace view public.sales_with_agents with (security_invoker = true) as
select
  s.*,
  wa.name as writing_agent_name,
  ua.name as upline_agent_name
from public.sales s
join public.agents wa on wa.id = s.writing_agent_id
left join public.agents ua on ua.id = s.upline_agent_id;

create index if not exists idx_agents_owner on public.agents(owner_user_id);
create index if not exists idx_sales_owner on public.sales(owner_user_id);
create index if not exists idx_sales_writing_agent on public.sales(writing_agent_id);
create index if not exists idx_sales_upline_agent on public.sales(upline_agent_id);
create index if not exists idx_sales_status on public.sales(status);
create index if not exists idx_payouts_owner on public.payouts(owner_user_id);
create index if not exists idx_payout_items_owner on public.payout_items(owner_user_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_agents_updated_at on public.agents;
create trigger trg_agents_updated_at before update on public.agents for each row execute function public.set_updated_at();

drop trigger if exists trg_sales_updated_at on public.sales;
create trigger trg_sales_updated_at before update on public.sales for each row execute function public.set_updated_at();

alter table public.agents enable row level security;
alter table public.sales enable row level security;
alter table public.payouts enable row level security;
alter table public.payout_items enable row level security;

create policy "agents_select_own" on public.agents for select to authenticated using ((select auth.uid()) = owner_user_id);
create policy "agents_insert_own" on public.agents for insert to authenticated with check ((select auth.uid()) = owner_user_id);
create policy "agents_update_own" on public.agents for update to authenticated using ((select auth.uid()) = owner_user_id) with check ((select auth.uid()) = owner_user_id);
create policy "agents_delete_own" on public.agents for delete to authenticated using ((select auth.uid()) = owner_user_id);

create policy "sales_select_own" on public.sales for select to authenticated using ((select auth.uid()) = owner_user_id);
create policy "sales_insert_own" on public.sales for insert to authenticated with check ((select auth.uid()) = owner_user_id);
create policy "sales_update_own" on public.sales for update to authenticated using ((select auth.uid()) = owner_user_id) with check ((select auth.uid()) = owner_user_id);
create policy "sales_delete_own" on public.sales for delete to authenticated using ((select auth.uid()) = owner_user_id);

create policy "payouts_select_own" on public.payouts for select to authenticated using ((select auth.uid()) = owner_user_id);
create policy "payouts_insert_own" on public.payouts for insert to authenticated with check ((select auth.uid()) = owner_user_id);
create policy "payouts_update_own" on public.payouts for update to authenticated using ((select auth.uid()) = owner_user_id) with check ((select auth.uid()) = owner_user_id);
create policy "payouts_delete_own" on public.payouts for delete to authenticated using ((select auth.uid()) = owner_user_id);

create policy "payout_items_select_own" on public.payout_items for select to authenticated using ((select auth.uid()) = owner_user_id);
create policy "payout_items_insert_own" on public.payout_items for insert to authenticated with check ((select auth.uid()) = owner_user_id);
create policy "payout_items_update_own" on public.payout_items for update to authenticated using ((select auth.uid()) = owner_user_id) with check ((select auth.uid()) = owner_user_id);
create policy "payout_items_delete_own" on public.payout_items for delete to authenticated using ((select auth.uid()) = owner_user_id);

grant usage on schema public to authenticated;
grant select, insert, update, delete on public.agents, public.sales, public.payouts, public.payout_items to authenticated;
grant select on public.sales_with_agents to authenticated;
