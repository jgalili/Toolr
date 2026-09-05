-- =====================================================================
-- NailedIt — apply these five migrations, in this order.
-- Safe to run more than once: every statement is idempotent or a replace.
-- Generated 2026-09-05T08:23:02Z
-- =====================================================================

-- ─── 20260101001500_decline_is_never_blocked.sql ───

-- =====================================================================
-- NailedIt — a decline is an answer, not a booking
--
-- Reported as "when I click accept or decline for someone's 'wants to
-- borrow' message, nothing happens". Nothing was the button's fault. The
-- server was answering, precisely and correctly:
--
--   400  22023  "That return time has already passed"
--
-- Two separate faults produced "nothing happens" from that:
--
--  1. The app never rendered a failed mutation, so a considered refusal was
--     indistinguishable from a dead control. Fixed in the client, once, for
--     every mutation (see app/_layout.tsx).
--
--  2. This function validated the return window BEFORE it looked at the
--     decision. So a request whose window had already gone by could not even
--     be DECLINED — the one answer that is always available in real life, and
--     the only one that gets a stale request out of an owner's inbox. An
--     owner with a day-old request was stuck with it permanently.
--
-- The window only has to make sense if you are agreeing to it. Declining, and
-- letting a request lapse, are answers about the request, not the calendar.
-- So the checks move inside the accept branch, and the hint tells the client
-- which control fixes it.
-- =====================================================================

create or replace function public.respond_to_request(
  p_request_id uuid,
  p_decision   request_status,
  p_due_at     timestamptz default null
)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_req  public.borrow_requests;
  v_conv uuid;
  v_tool text;
  v_due  timestamptz;
begin
  select * into v_req from public.borrow_requests where id = p_request_id;
  if v_req.id is null then
    raise exception 'Request not found' using errcode = 'P0002';
  end if;
  if v_req.owner_id <> auth.uid() then
    raise exception 'Only the owner can answer this request' using errcode = '42501';
  end if;
  if v_req.status <> 'pending' then
    raise exception 'That request has already been answered' using errcode = '22023';
  end if;
  if p_decision not in ('accepted', 'declined') then
    raise exception 'Invalid decision' using errcode = '22023';
  end if;

  v_due := coalesce(p_due_at, v_req.end_at);

  -- Only an ACCEPT commits anyone to a date, so only an accept is judged on one.
  if p_decision = 'accepted' then
    if v_due <= v_req.start_at then
      raise exception 'The return has to be after the pickup'
        using errcode = '22023', hint = 'adjust_return';
    end if;
    -- An hour of slack: a request made for "back by 6" should still be
    -- acceptable at 6:20 without making the owner re-pick a time.
    if v_due < now() - interval '1 hour' then
      raise exception 'That return time has already passed'
        using errcode = '22023', hint = 'adjust_return';
    end if;
  end if;

  update public.borrow_requests
     set status = p_decision,
         responded_at = now(),
         end_at = case when p_decision = 'accepted' then v_due else end_at end
   where id = p_request_id;

  select title into v_tool from public.tools where id = v_req.tool_id;

  if p_decision = 'accepted' then
    insert into public.transactions (
      request_id, tool_id, owner_id, borrower_id, status,
      agreed_total_agorot, payment_mode, payment_status, payment_provider, due_at
    ) values (
      v_req.id, v_req.tool_id, v_req.owner_id, v_req.borrower_id, 'agreed',
      v_req.quoted_total_agorot, v_req.payment_mode,
      (case when v_req.payment_mode = 'free' then 'not_applicable' else 'pending' end)::payment_status,
      case when v_req.payment_mode = 'free' then null else 'offline' end,
      v_due
    );

    insert into public.conversations (tool_id, request_id, owner_id, borrower_id, last_message_at)
    values (v_req.tool_id, v_req.id, v_req.owner_id, v_req.borrower_id, now())
    returning id into v_conv;

    insert into public.messages (conversation_id, sender_id, kind, body)
    values (v_conv, v_req.owner_id, 'system', 'Request accepted. Pickup details are now shared.');

    if p_due_at is not null and p_due_at <> v_req.end_at then
      insert into public.messages (conversation_id, sender_id, kind, body)
      values (
        v_conv, v_req.owner_id, 'system',
        'Return time set to ' || to_char(v_due at time zone 'Asia/Jerusalem', 'Dy DD Mon, HH24:MI')
      );
    end if;
  end if;

  insert into public.notifications (user_id, kind, title, body, route, payload)
  values (
    v_req.borrower_id,
    (case when p_decision = 'accepted' then 'borrow_request_accepted'
          else 'borrow_request_declined' end)::notification_kind,
    case when p_decision = 'accepted' then 'Request accepted' else 'Request declined' end,
    coalesce(v_tool, ''),
    'nailedit://requests/' || v_req.id,
    jsonb_build_object('request_id', v_req.id, 'due_at', v_due)
  );
end $$;

grant execute on function public.respond_to_request(uuid, request_status, timestamptz)
  to authenticated;

-- ─── 20260101001600_counterparty_can_see_the_tool.sql ───

-- =====================================================================
-- NailedIt — the person holding the drill can still see the drill
--
-- A regression introduced by the lending lifecycle, and a good example of two
-- correct rules combining into a wrong one.
--
--   sync_tool_availability()  sets tools.status = 'borrowed' at pickup, so the
--                             listing leaves search while it is out. Right.
--   tools_read_active         lets anyone read a listing where status =
--                             'active'. Right, when 'borrowed' did not exist.
--
-- Together: the moment a loan starts, the only person who can still read the
-- row is the owner (via tools_read_own). The borrower — who is holding the
-- thing — gets an empty embed, so their "Borrowing" card renders with no
-- title and no photo, and the return controls hang off a nameless card. The
-- same applied to tool_photos_read, which tests the same status.
--
-- The fix is a third read path: the two people in a transaction can read that
-- transaction's tool, whatever its status. Note what this does NOT touch —
-- tool_locations stays owner-only, and exact coordinates are still reachable
-- only through get_pickup_location(), which re-checks the transaction state.
-- A listing's title and photo were always public; its address never was.
-- =====================================================================

-- SECURITY DEFINER so the check itself is not subject to RLS on transactions,
-- which would make the policy depend on a policy. STABLE so the planner may
-- evaluate it once per statement rather than once per row.
create or replace function public.is_transaction_party(p_tool_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
      from public.transactions t
     where t.tool_id = p_tool_id
       and auth.uid() in (t.owner_id, t.borrower_id)
  )
  or exists (
    -- Also while a request is merely pending: having asked about a tool is
    -- enough to keep seeing it if the owner pauses the listing meanwhile.
    select 1
      from public.borrow_requests r
     where r.tool_id = p_tool_id
       and auth.uid() in (r.owner_id, r.borrower_id)
  );
$$;

revoke execute on function public.is_transaction_party(uuid) from public;
grant execute on function public.is_transaction_party(uuid) to authenticated;

drop policy if exists tools_read_counterparty on public.tools;
create policy tools_read_counterparty on public.tools for select
  using (public.is_transaction_party(id));

drop policy if exists tool_photos_read_counterparty on public.tool_photos;
create policy tool_photos_read_counterparty on public.tool_photos for select
  using (public.is_transaction_party(tool_id));

-- ─── 20260101001700_edit_and_remove_listings.sql ───

-- =====================================================================
-- NailedIt — a listing you can change your mind about
--
-- Reported plainly: "when I publish an item I can't change the details after
-- I publish (for example - cost, availability etc...) and I can't delete
-- items". Both were true. create_tool_with_location() was the only write
-- path, and the only thing that could be changed afterwards was the on/off
-- switch in setToolStatus.
--
-- That is a real problem rather than a missing nicety. A price typed wrong is
-- permanent; a tool you sold is advertised forever; and the workaround people
-- reach for — publish a second, corrected copy — quietly fills the
-- neighbourhood with duplicates.
--
-- Two functions here, deliberately separate from the create path:
--
--   update_tool()  — every editable field, each one optional, with the
--                    price/free rule enforced the same way it is on create.
--   remove_tool()  — a soft delete, refused while the tool is in someone
--                    else's hands.
-- =====================================================================

-- ---------------------------------------------------------------------
-- update_tool
--
-- Every parameter defaults to null and null means "leave it alone", so a
-- client may send only the field it changed. The two places where null is a
-- meaningful VALUE rather than "unchanged" — clearing a description, taking
-- the ceiling off max_borrow_days — get explicit p_clear_* flags, because
-- guessing between them is how an edit screen silently wipes a field the
-- person never touched.
-- ---------------------------------------------------------------------
create or replace function public.update_tool(
  p_tool_id              uuid,
  p_title                text default null,
  p_description          text default null,
  p_condition            text default null,
  p_accessories          text default null,
  p_instructions         text default null,
  p_max_borrow_days      smallint default null,
  p_is_free              boolean default null,
  p_price_per_day_agorot bigint default null,
  p_availability_mode    availability_mode default null,
  p_category_slug        text default null,
  p_address_line         text default null,
  p_pickup_notes         text default null,
  p_lat                  double precision default null,
  p_lng                  double precision default null,
  p_clear_description    boolean default false,
  p_clear_accessories    boolean default false,
  p_clear_instructions   boolean default false,
  p_clear_max_days       boolean default false
)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_tool     public.tools;
  v_category smallint;
  v_free     boolean;
  v_price    bigint;
  v_exact    geography(Point, 4326);
begin
  select * into v_tool from public.tools where id = p_tool_id and deleted_at is null;
  if v_tool.id is null then
    raise exception 'That tool is not available' using errcode = 'P0002';
  end if;
  if v_tool.owner_id <> auth.uid() then
    raise exception 'not_your_tool' using errcode = '42501';
  end if;

  -- Resolve the pricing pair TOGETHER. Changing only one of them is how a
  -- listing ends up marked free with a price attached, or marked paid with
  -- none — and the second of those is what create already refuses.
  v_free  := coalesce(p_is_free, v_tool.payment_mode = 'free');
  v_price := coalesce(p_price_per_day_agorot, v_tool.price_per_day_agorot);
  if not v_free and coalesce(v_price, 0) <= 0 then
    raise exception 'A rental needs a price per day' using errcode = '22023';
  end if;

  if p_category_slug is not null then
    select id into v_category from public.tool_categories where slug = p_category_slug;
  end if;

  update public.tools set
    title               = coalesce(p_title, title),
    description         = case when p_clear_description then null
                               else coalesce(p_description, description) end,
    condition           = coalesce(p_condition, condition),
    accessories         = case when p_clear_accessories then null
                               else coalesce(p_accessories, accessories) end,
    instructions        = case when p_clear_instructions then null
                               else coalesce(p_instructions, instructions) end,
    max_borrow_days     = case when p_clear_max_days then null
                               else coalesce(p_max_borrow_days, max_borrow_days) end,
    payment_mode        = case when v_free then 'free' else 'offline' end::payment_mode,
    price_per_day_agorot = case when v_free then null else v_price end,
    availability_mode   = coalesce(p_availability_mode, availability_mode),
    category_id         = coalesce(v_category, category_id),
    updated_at          = now()
  where id = p_tool_id;

  -- Moving the tool re-fuzzes the public point from the new exact one, using
  -- the same offset function as create. Never write the exact point to
  -- public.tools, not even for a moment.
  if p_lat is not null and p_lng is not null then
    v_exact := ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography;
    update public.tools set fuzzed_location = public.fuzz_point(v_exact, p_tool_id)
     where id = p_tool_id;
    insert into public.tool_locations (tool_id, exact_location, address_line, pickup_notes)
    values (p_tool_id, v_exact, p_address_line, p_pickup_notes)
    on conflict (tool_id) do update
      set exact_location = excluded.exact_location,
          address_line   = coalesce(excluded.address_line, public.tool_locations.address_line),
          pickup_notes   = coalesce(excluded.pickup_notes, public.tool_locations.pickup_notes);
  elsif p_address_line is not null or p_pickup_notes is not null then
    update public.tool_locations set
      address_line = coalesce(p_address_line, address_line),
      pickup_notes = coalesce(p_pickup_notes, pickup_notes)
    where tool_id = p_tool_id;
  end if;
end $$;

grant execute on function public.update_tool(
  uuid, text, text, text, text, text, smallint, boolean, bigint, availability_mode,
  text, text, text, double precision, double precision, boolean, boolean, boolean, boolean
) to authenticated;

-- ---------------------------------------------------------------------
-- remove_tool
--
-- A SOFT delete. The row stays, so a completed loan keeps its title and the
-- other person's history does not develop a hole where a tool used to be —
-- the same reason the deletion-retention rules exist elsewhere in this schema.
--
-- Refused while the tool is out. Deleting a listing does not get you your
-- ladder back, and letting the record vanish mid-loan takes the return
-- controls with it.
-- ---------------------------------------------------------------------
create or replace function public.remove_tool(p_tool_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_owner uuid;
  v_live  integer;
begin
  select owner_id into v_owner from public.tools where id = p_tool_id and deleted_at is null;
  if v_owner is null then
    raise exception 'That tool is not available' using errcode = 'P0002';
  end if;
  if v_owner <> auth.uid() then
    raise exception 'not_your_tool' using errcode = '42501';
  end if;

  select count(*) into v_live from public.transactions
   where tool_id = p_tool_id and status in ('agreed', 'picked_up', 'returned');
  if v_live > 0 then
    raise exception 'That tool is out on loan right now' using errcode = '22023';
  end if;

  -- Any pending request for it is answered by the removal itself. Leaving
  -- them pending would leave people waiting for a reply that cannot come.
  update public.borrow_requests
     set status = 'cancelled', responded_at = now()
   where tool_id = p_tool_id and status = 'pending';

  update public.tools
     set deleted_at = now(), status = 'removed', updated_at = now()
   where id = p_tool_id;
end $$;

grant execute on function public.remove_tool(uuid) to authenticated;

-- The public read policy already required `deleted_at is null`; the owner's
-- own policy did not, so a removed listing still appeared in My Tools.
drop policy if exists tools_read_own on public.tools;
create policy tools_read_own on public.tools for select
  using (owner_id = auth.uid() and deleted_at is null);

-- ─── 20260101001800_real_exchange_counts.sql ───

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

-- ─── 20260101001900_exchange_count_in_search.sql ───

-- =====================================================================
-- NailedIt — a card that says how many times this tool has gone out
--
-- "It needs to show on the actual tools/items, in case they have been
-- already successfully exchanged through the app, the amount of times that
-- happened."
--
-- That number is the most useful thing a listing can say about itself. A
-- ladder that has been lent eleven times is a different proposition from one
-- that has never left the balcony, and no amount of description substitutes
-- for it. So it belongs on the search result, not only on the detail page.
--
-- Adding a column to a `returns table` function is the one change `create or
-- replace` cannot make: it refuses to change a return type. The function has
-- to be dropped by its exact signature first. Getting this wrong is what
-- produced "function ... is not unique" earlier in this project — a leftover
-- old definition sitting beside the new one, matching every call equally well.
-- =====================================================================

drop function if exists public.search_tools_nearby(
  double precision, double precision, integer, boolean, smallint, text[], text,
  bigint, timestamptz, timestamptz, integer, integer
);

create or replace function public.search_tools_nearby(
  p_lat          double precision,
  p_lng          double precision,
  p_radius_m     integer default 500,
  p_free_only    boolean default false,
  p_category_id  smallint default null,
  p_tool_types   text[] default null,
  p_query        text default null,
  p_max_price    bigint default null,
  p_available_from timestamptz default null,
  p_available_to   timestamptz default null,
  p_limit        integer default 30,
  p_offset       integer default 0
)
returns table (
  id                   uuid,
  title                text,
  tool_type            text,
  brand                text,
  category_id          smallint,
  category_slug        text,
  owner_id             uuid,
  payment_mode         payment_mode,
  price_per_day_agorot bigint,
  currency             char(3),
  availability_mode    availability_mode,
  risk                 risk_level,
  neighborhood_label   text,
  distance_m           integer,
  lat                  double precision,
  lng                  double precision,
  primary_photo        text,
  owner_first_name     text,
  owner_avatar_url     text,
  owner_rating         numeric,
  owner_rating_count   integer,
  completed_exchanges  integer,
  score                double precision
)
language sql stable security definer set search_path = public as $$
  with origin as (
    select ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography as g
  )
  select
    t.id,
    t.title,
    t.tool_type,
    t.brand,
    t.category_id,
    tc.slug,
    t.owner_id,
    t.payment_mode,
    t.price_per_day_agorot,
    t.currency,
    t.availability_mode,
    t.risk,
    t.neighborhood_label,
    -- rounded to 50 m: precise distances from several vantage points would
    -- otherwise let an attacker trilaterate even the fuzzed point.
    (round(ST_Distance(t.fuzzed_location, o.g) / 50.0) * 50)::int as distance_m,
    ST_Y(t.fuzzed_location::geometry) as lat,
    ST_X(t.fuzzed_location::geometry) as lng,
    (select tp.storage_path from public.tool_photos tp
      where tp.tool_id = t.id order by tp.position limit 1) as primary_photo,
    pr.first_name,
    pr.avatar_url,
    public.smoothed_rating(pr.rating_sum_owner, pr.rating_count_owner),
    pr.rating_count_owner,
    t.completed_exchanges,
    (
        0.45 * exp(-ST_Distance(t.fuzzed_location, o.g) / 500.0)
      + 0.20 * case t.availability_mode when 'now' then 1.0 when 'dates' then 0.7 else 0.4 end
      + 0.15 * case
                 when p_tool_types is not null and t.tool_type = any(p_tool_types) then 1.0
                 when p_category_id is not null and t.category_id = p_category_id then 0.6
                 else 0.3 end
      + 0.12 * (public.smoothed_rating(pr.rating_sum_owner, pr.rating_count_owner) / 5.0)
      + 0.08 * case when t.payment_mode = 'free' then 1.0 else 0.0 end
    )::double precision as score
  from public.tools t
  cross join origin o
  join public.tool_categories tc on tc.id = t.category_id
  join public.profiles pr on pr.id = t.owner_id
  where t.status = 'active'
    and t.deleted_at is null
    and pr.is_banned = false
    and pr.deleted_at is null
    and ST_DWithin(t.fuzzed_location, o.g, p_radius_m)
    and (not p_free_only or t.payment_mode = 'free')
    and (p_category_id is null or t.category_id = p_category_id)
    and (p_tool_types is null or t.tool_type = any(p_tool_types))
    and (p_max_price is null or t.payment_mode = 'free' or t.price_per_day_agorot <= p_max_price)
    and (p_query is null or t.search_tsv @@ plainto_tsquery('simple', p_query) or t.title ilike '%'||p_query||'%')
    and (
      p_available_from is null
      or t.availability_mode in ('now','ask')
      or exists (
        select 1 from public.tool_availability ta
        where ta.tool_id = t.id and ta.kind = 'available'
          and ta.start_date <= coalesce(p_available_to, p_available_from)::date
          and ta.end_date   >= p_available_from::date
      )
    )
    -- never surface tools from someone the viewer blocked, or who blocked them
    and not exists (
      select 1 from public.blocks b
      where (b.blocker_id = auth.uid() and b.blocked_id = t.owner_id)
         or (b.blocker_id = t.owner_id and b.blocked_id = auth.uid())
    )
  order by score desc, distance_m asc
  limit least(p_limit, 100) offset p_offset;
$$;

grant execute on function public.search_tools_nearby(
  double precision, double precision, integer, boolean, smallint, text[], text,
  bigint, timestamptz, timestamptz, integer, integer
) to anon, authenticated;


-- ─── 20260101002000_archive_conversations.sql ───

-- =====================================================================
-- NailedIt — clearing out old chats
--
-- "I can't delete items / old messages / edit stuff."
--
-- Items and editing are handled in 20260101001700. This is the chat half,
-- and it is the one place in the request where "delete" is the wrong verb.
--
-- A conversation has two people in it. If one of them deletes it, the other
-- loses their record of an exchange they were equally part of — including the
-- system messages that say when the tool was handed over and when it came
-- back, which is exactly what you want if a dispute comes up later. The rest
-- of this schema already takes that position (see the retention rules): your
-- own data goes when you go, but the other person's account of a shared event
-- does not go with it.
--
-- So: hidden for you, intact for them. It behaves like delete — the thread
-- leaves your list and stays gone — and it un-hides if they write again,
-- because a new message is not old mail.
-- =====================================================================

create table if not exists public.conversation_hides (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id         uuid not null references public.profiles(id) on delete cascade,
  hidden_at       timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

alter table public.conversation_hides enable row level security;

-- Your own hides, and nobody else's: whether someone has cleared a thread is
-- their business, not their counterparty's.
drop policy if exists conversation_hides_own on public.conversation_hides;
create policy conversation_hides_own on public.conversation_hides for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create index if not exists conversation_hides_user_idx
  on public.conversation_hides (user_id, conversation_id);

-- ---------------------------------------------------------------------
-- hide_conversation / unhide_conversation
--
-- Through functions rather than direct writes so that "am I in this
-- conversation at all" is checked once, server-side, instead of relying on a
-- policy that only knows about the hides table.
-- ---------------------------------------------------------------------
create or replace function public.hide_conversation(p_conversation_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare v_conv public.conversations;
begin
  select * into v_conv from public.conversations where id = p_conversation_id;
  if v_conv.id is null then
    raise exception 'That conversation is not available' using errcode = 'P0002';
  end if;
  if auth.uid() not in (v_conv.owner_id, v_conv.borrower_id) then
    raise exception 'Not your conversation' using errcode = '42501';
  end if;

  insert into public.conversation_hides (conversation_id, user_id)
  values (p_conversation_id, auth.uid())
  on conflict (conversation_id, user_id) do update set hidden_at = now();
end $$;

create or replace function public.unhide_conversation(p_conversation_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  delete from public.conversation_hides
   where conversation_id = p_conversation_id and user_id = auth.uid();
end $$;

grant execute on function public.hide_conversation(uuid)   to authenticated;
grant execute on function public.unhide_conversation(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- A new message brings the thread back
--
-- Without this, clearing a chat would silently mute that person forever, and
-- the first the borrower would know of it is when their message went
-- unanswered. Hiding is for tidiness, not for blocking — blocking has its own
-- table and its own consequences.
-- ---------------------------------------------------------------------
create or replace function public.unhide_on_new_message()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from public.conversation_hides
   where conversation_id = new.conversation_id
     and user_id <> new.sender_id;
  return new;
end $$;

drop trigger if exists trg_unhide_on_new_message on public.messages;
create trigger trg_unhide_on_new_message
  after insert on public.messages
  for each row execute function public.unhide_on_new_message();
