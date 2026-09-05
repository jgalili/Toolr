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

