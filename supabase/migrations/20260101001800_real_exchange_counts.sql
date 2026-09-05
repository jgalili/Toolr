-- =====================================================================
-- NailedIt — count the exchanges that actually happened
--
-- Reported as: "it doesn't REALLY count the number of successful exchanges
-- for tools / users. And doesn't show the reviews anywhere."
--
-- Both halves were true, and they share one cause. Three numbers are shown to
-- people — a person's exchange count, their star rating, and the number of
-- reviews behind it — and none of them was required to agree with the rows in
-- the database:
--
--   * completed_lends / completed_borrows are counters incremented by
--     confirm_return(). A counter is only ever as correct as every write that
--     ever touched it, and this schema has had several: a hand-written seed
--     that set completed_lends = 23 on profiles with no transactions at all,
--     and two generations of confirm_return.
--   * rating_sum / rating_count are counters too, and the same seed invented
--     "4.9 from 12 reviews" for people with zero rating ROWS. Tapping through
--     to read those twelve reviews therefore found nothing — which is exactly
--     the second half of the report.
--
-- The fix is not a better counter. It is to make the counters answerable to
-- the rows, with one function that RECOMPUTES them from transactions and
-- ratings, run here as a backfill and available to run again whenever a doubt
-- arises. A number nobody can recompute is a number nobody should show.
--
-- Then, the missing one: how many times THIS tool has gone out and come back.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Per-tool exchange count
-- ---------------------------------------------------------------------
alter table public.tools
  add column if not exists completed_exchanges integer not null default 0;

comment on column public.tools.completed_exchanges is
  'Completed loans of this tool. Derived from transactions; recompute with recount_exchanges().';

-- ---------------------------------------------------------------------
-- 2. One place that decides what these numbers are
--
-- Deliberately a full recompute rather than a delta. It is idempotent, so
-- running it twice is harmless; it repairs drift instead of adding to it; and
-- it is cheap at this size. When the neighbourhood is big enough for that to
-- stop being true, this becomes an incremental job — and the recompute stays,
-- as the thing that proves the incremental job is right.
-- ---------------------------------------------------------------------
create or replace function public.recount_exchanges()
returns void
language sql
security definer
set search_path = public
as $$
  with lends as (
    select owner_id as id, count(*) as n from public.transactions
     where status = 'completed' group by owner_id
  ), borrows as (
    select borrower_id as id, count(*) as n from public.transactions
     where status = 'completed' group by borrower_id
  ), stars as (
    select ratee_id as id,
           coalesce(sum(stars) filter (where direction = 'borrower_to_owner'), 0) as sum_owner,
           count(*)   filter (where direction = 'borrower_to_owner')              as n_owner,
           coalesce(sum(stars) filter (where direction = 'owner_to_borrower'), 0) as sum_borrower,
           count(*)   filter (where direction = 'owner_to_borrower')              as n_borrower
      from public.ratings
     where is_published
     group by ratee_id
  )
  update public.profiles p set
    completed_lends       = coalesce(l.n, 0),
    completed_borrows     = coalesce(b.n, 0),
    rating_sum_owner      = coalesce(s.sum_owner, 0),
    rating_count_owner    = coalesce(s.n_owner, 0),
    rating_sum_borrower   = coalesce(s.sum_borrower, 0),
    rating_count_borrower = coalesce(s.n_borrower, 0)
  from (select id from public.profiles) ids
  left join lends   l on l.id = ids.id
  left join borrows b on b.id = ids.id
  left join stars   s on s.id = ids.id
  where p.id = ids.id;
$$;

-- Tools are a second statement rather than a second CTE: a `sql` function
-- returning void may hold several, and keeping them apart makes each one
-- readable on its own.
create or replace function public.recount_tool_exchanges()
returns void
language sql
security definer
set search_path = public
as $$
  update public.tools t
     set completed_exchanges = coalesce(c.n, 0)
    from (select id from public.tools) ids
    left join (
      select tool_id, count(*) as n from public.transactions
       where status = 'completed' group by tool_id
    ) c on c.tool_id = ids.id
   where t.id = ids.id;
$$;

revoke execute on function public.recount_exchanges()      from public;
revoke execute on function public.recount_tool_exchanges() from public;

-- ---------------------------------------------------------------------
-- 3. Keep the per-tool count current
--
-- A trigger on the transition INTO 'completed', not on every update: the
-- condition is the transition, and writing it as "status = 'completed'" is
-- how a counter starts climbing every time anything else on the row is
-- touched. That is the failure mode this whole migration exists to answer.
-- ---------------------------------------------------------------------
create or replace function public.bump_tool_exchanges()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'completed' and coalesce(old.status::text, '') <> 'completed' then
    update public.tools set completed_exchanges = completed_exchanges + 1
     where id = new.tool_id;
  end if;
  return new;
end $$;

drop trigger if exists trg_bump_tool_exchanges on public.transactions;
create trigger trg_bump_tool_exchanges
  after update of status on public.transactions
  for each row execute function public.bump_tool_exchanges();

-- ---------------------------------------------------------------------
-- 4. Backfill, so today's numbers are the recomputed ones
--
-- This is the step that erases the seeded fiction. Demo neighbours who were
-- given "23 exchanges, 4.8 stars" and no rows to back it will now read as
-- what they are. That is the point: a rating you can tap into and find
-- nothing is worse than no rating at all.
-- ---------------------------------------------------------------------
select public.recount_exchanges();
select public.recount_tool_exchanges();
