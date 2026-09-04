-- =====================================================================
-- NailedIt — write RPCs
--
-- Anything that must be atomic, or that must not let a client see an
-- intermediate state, lives here rather than as a sequence of client-side
-- inserts. The most important one is create_tool_with_location: doing that as
-- two separate inserts would put the owner's exact coordinates into the public
-- `tools` table for the moment between them.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Create a listing. The exact point NEVER touches the public table:
-- the id is generated first, the fuzzed point derived from it, and both
-- rows written in one transaction.
-- ---------------------------------------------------------------------
create or replace function public.create_tool_with_location(
  p_title                text,
  p_tool_type            text,
  p_brand                text,
  p_model                text,
  p_is_model_confirmed   boolean,
  p_category_slug        text,
  p_description          text,
  p_condition            text,
  p_accessories          text,
  p_instructions         text,
  p_max_borrow_days      smallint,
  p_is_free              boolean,
  p_price_per_day_agorot bigint,
  p_availability_mode    availability_mode,
  p_risk                 risk_level,
  p_lat                  double precision,
  p_lng                  double precision,
  p_neighborhood_label   text default null,
  p_address_line         text default null,
  p_pickup_notes         text default null
)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id       uuid := gen_random_uuid();
  v_user     uuid := auth.uid();
  v_category smallint;
  v_exact    geography(Point, 4326);
begin
  if not public.is_member() then
    raise exception 'Only signed-in members can list a tool' using errcode = '42501';
  end if;

  select id into v_category from public.tool_categories where slug = p_category_slug;
  if v_category is null then
    select id into v_category from public.tool_categories where slug = 'other';
  end if;

  if not p_is_free and coalesce(p_price_per_day_agorot, 0) <= 0 then
    raise exception 'A rental needs a price per day' using errcode = '22023';
  end if;

  v_exact := ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography;

  insert into public.tools (
    id, owner_id, category_id, title, tool_type, brand, model, is_model_confirmed,
    description, condition, accessories, instructions, max_borrow_days,
    payment_mode, price_per_day_agorot, availability_mode, status, risk,
    fuzzed_location, neighborhood_label
  ) values (
    v_id, v_user, v_category, p_title, p_tool_type, p_brand, p_model, p_is_model_confirmed,
    p_description, p_condition, p_accessories, p_instructions, p_max_borrow_days,
    case when p_is_free then 'free' else 'offline' end::payment_mode,
    case when p_is_free then null else p_price_per_day_agorot end,
    p_availability_mode, 'active', p_risk,
    public.fuzz_point(v_exact, v_id), p_neighborhood_label
  );

  insert into public.tool_locations (tool_id, exact_location, address_line, pickup_notes)
  values (v_id, v_exact, p_address_line, p_pickup_notes);

  return v_id;
end $$;

-- ---------------------------------------------------------------------
-- Borrow request. Computes the quote server-side so a client cannot
-- propose its own price, and blocks duplicate pending requests.
-- ---------------------------------------------------------------------
create or replace function public.create_borrow_request(
  p_tool_id           uuid,
  p_start_at          timestamptz,
  p_end_at            timestamptz,
  p_message           text default null,
  p_risk_acknowledged boolean default false
)
returns public.borrow_requests
language plpgsql security definer set search_path = public as $$
declare
  v_tool  public.tools;
  v_user  uuid := auth.uid();
  v_days  integer;
  v_row   public.borrow_requests;
begin
  if not public.is_member() then
    raise exception 'Sign in to send a borrow request' using errcode = '42501';
  end if;

  select * into v_tool from public.tools
   where id = p_tool_id and status = 'active' and deleted_at is null;
  if v_tool.id is null then
    raise exception 'That tool is not available' using errcode = 'P0002';
  end if;
  if v_tool.owner_id = v_user then
    raise exception 'You cannot borrow your own tool' using errcode = '22023';
  end if;
  if v_tool.risk = 'high' and not p_risk_acknowledged then
    raise exception 'High-risk tools need a safety acknowledgement' using errcode = '22023';
  end if;

  if exists (
    select 1 from public.borrow_requests
     where tool_id = p_tool_id and borrower_id = v_user and status = 'pending'
  ) then
    raise exception 'You already have a pending request for this tool' using errcode = '23505';
  end if;

  v_days := greatest(1, ceil(extract(epoch from (p_end_at - p_start_at)) / 86400)::int);

  insert into public.borrow_requests (
    tool_id, borrower_id, owner_id, start_at, end_at, message,
    quoted_total_agorot, payment_mode, risk_acknowledged
  ) values (
    p_tool_id, v_user, v_tool.owner_id, p_start_at, p_end_at, p_message,
    case when v_tool.payment_mode = 'free' then null
         else coalesce(v_tool.price_per_day_agorot, 0) * v_days end,
    v_tool.payment_mode, p_risk_acknowledged
  ) returning * into v_row;

  insert into public.notifications (user_id, kind, title, body, route, payload)
  values (
    v_tool.owner_id, 'borrow_request_received',
    'New borrow request', v_tool.title,
    'nailedit://requests/' || v_row.id,
    jsonb_build_object('request_id', v_row.id, 'tool_id', p_tool_id)
  );

  return v_row;
end $$;

-- ---------------------------------------------------------------------
-- Accept or decline. Accepting creates the transaction AND the
-- conversation in the same breath — the borrower should never see an
-- accepted request with nowhere to talk.
-- ---------------------------------------------------------------------
create or replace function public.respond_to_request(
  p_request_id uuid,
  p_decision   request_status
)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_req  public.borrow_requests;
  v_conv uuid;
  v_tool text;
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

  update public.borrow_requests
     set status = p_decision, responded_at = now()
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
      v_req.end_at
    );

    insert into public.conversations (tool_id, request_id, owner_id, borrower_id, last_message_at)
    values (v_req.tool_id, v_req.id, v_req.owner_id, v_req.borrower_id, now())
    returning id into v_conv;

    insert into public.messages (conversation_id, sender_id, kind, body)
    values (v_conv, v_req.owner_id, 'system', 'Request accepted. Pickup details are now shared.');
  end if;

  insert into public.notifications (user_id, kind, title, body, route, payload)
  values (
    v_req.borrower_id,
    (case when p_decision = 'accepted' then 'borrow_request_accepted'
          else 'borrow_request_declined' end)::notification_kind,
    case when p_decision = 'accepted' then 'Request accepted' else 'Request declined' end,
    coalesce(v_tool, ''),
    'nailedit://requests/' || v_req.id,
    jsonb_build_object('request_id', v_req.id)
  );
end $$;

-- ---------------------------------------------------------------------
-- Return confirmation. Either side may confirm; the transaction only
-- completes once both have, or once a job ages out the grace period.
-- ---------------------------------------------------------------------
create or replace function public.confirm_return(p_transaction_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare v_tx public.transactions;
begin
  select * into v_tx from public.transactions where id = p_transaction_id;
  if v_tx.id is null then
    raise exception 'Transaction not found' using errcode = 'P0002';
  end if;
  if auth.uid() not in (v_tx.owner_id, v_tx.borrower_id) then
    raise exception 'Not your transaction' using errcode = '42501';
  end if;

  if auth.uid() = v_tx.owner_id then
    update public.transactions set owner_confirmed_return_at = now() where id = p_transaction_id;
  else
    update public.transactions set borrower_confirmed_return_at = now() where id = p_transaction_id;
  end if;

  update public.transactions
     set status = 'returned', returned_at = coalesce(returned_at, now())
   where id = p_transaction_id and status in ('agreed', 'picked_up');

  update public.transactions t
     set status = 'completed', completed_at = now()
   where t.id = p_transaction_id
     and t.owner_confirmed_return_at is not null
     and t.borrower_confirmed_return_at is not null;

  update public.profiles p
     set completed_lends = completed_lends + 1
   where p.id = v_tx.owner_id
     and exists (select 1 from public.transactions x
                  where x.id = p_transaction_id and x.status = 'completed');

  update public.profiles p
     set completed_borrows = completed_borrows + 1
   where p.id = v_tx.borrower_id
     and exists (select 1 from public.transactions x
                  where x.id = p_transaction_id and x.status = 'completed');
end $$;

-- ---------------------------------------------------------------------
-- Ratings are double-blind: a rating publishes when both sides have
-- rated, or after 7 days, whichever comes first. Without that window the
-- first rater sets the tone and the second rates retaliatorily.
-- ---------------------------------------------------------------------
create or replace function public.submit_rating(
  p_transaction_id uuid,
  p_stars          smallint,
  p_tags           text[] default '{}',
  p_comment        text default null
)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_tx        public.transactions;
  v_ratee     uuid;
  v_direction rating_direction;
begin
  select * into v_tx from public.transactions where id = p_transaction_id;
  if v_tx.id is null or auth.uid() not in (v_tx.owner_id, v_tx.borrower_id) then
    raise exception 'Not your transaction' using errcode = '42501';
  end if;
  if v_tx.status not in ('returned', 'completed') then
    raise exception 'You can rate once the tool is back' using errcode = '22023';
  end if;

  if auth.uid() = v_tx.borrower_id then
    v_ratee := v_tx.owner_id;
    v_direction := 'borrower_to_owner';
  else
    v_ratee := v_tx.borrower_id;
    v_direction := 'owner_to_borrower';
  end if;

  insert into public.ratings (transaction_id, rater_id, ratee_id, direction, stars, tags, comment)
  values (p_transaction_id, auth.uid(), v_ratee, v_direction, p_stars, coalesce(p_tags, '{}'), p_comment)
  on conflict (transaction_id, rater_id) do nothing;

  -- Both sides in? Publish the pair together.
  if (select count(*) from public.ratings where transaction_id = p_transaction_id) = 2 then
    update public.ratings set is_published = true
     where transaction_id = p_transaction_id and not is_published;
  end if;

  insert into public.notifications (user_id, kind, title, body, route, payload)
  values (v_ratee, 'rating_received', 'You received a rating', '',
          'nailedit://transaction/' || p_transaction_id,
          jsonb_build_object('transaction_id', p_transaction_id));
end $$;

/**
 * Publishes ratings whose 7-day double-blind window has passed with only one
 * side rating. Run this daily (pg_cron, or a scheduled Edge Function).
 */
create or replace function public.publish_stale_ratings()
returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  update public.ratings
     set is_published = true
   where not is_published and created_at < now() - interval '7 days';
  get diagnostics n = row_count;
  return n;
end $$;

-- ---------------------------------------------------------------------
-- Tool requests (the "I need a tool" broadcast)
-- ---------------------------------------------------------------------
create or replace function public.create_tool_request(
  p_raw_text          text,
  p_parsed_tool_types text[],
  p_radius_m          integer,
  p_needed_from       timestamptz,
  p_needed_to         timestamptz,
  p_lat               double precision,
  p_lng               double precision
)
returns public.tool_requests
language plpgsql security definer set search_path = public as $$
declare
  v_row public.tool_requests;
  v_id  uuid := gen_random_uuid();
begin
  if not public.is_member() then
    raise exception 'Sign in to post what you need' using errcode = '42501';
  end if;

  insert into public.tool_requests (
    id, requester_id, raw_text, parsed_tool_types, radius_m,
    needed_from, needed_to, fuzzed_location
  ) values (
    v_id, auth.uid(), p_raw_text, coalesce(p_parsed_tool_types, '{}'), p_radius_m,
    p_needed_from, p_needed_to,
    -- The requester's own position is fuzzed too. Wanting a tool should not
    -- publish where you live any more than owning one does.
    public.fuzz_point(ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography, v_id)
  ) returning * into v_row;

  -- Notify nearby owners who have a matching tool and haven't opted out.
  insert into public.notifications (user_id, kind, title, body, route, payload)
  select distinct m.owner_id, 'nearby_tool_request',
         'Someone nearby needs a tool', v_row.raw_text,
         'nailedit://request/' || v_row.id,
         jsonb_build_object('tool_request_id', v_row.id, 'tool_id', m.tool_id,
                            'distance_m', m.distance_m)
    from public.match_tool_request(v_row.id) m;

  return v_row;
end $$;

create or replace function public.nearby_tool_requests(
  p_lat      double precision,
  p_lng      double precision,
  p_radius_m integer default 3000
)
returns table (
  id                   uuid,
  requester_id         uuid,
  requester_first_name text,
  raw_text             text,
  parsed_tool_types    text[],
  category_id          smallint,
  radius_m             integer,
  needed_from          timestamptz,
  needed_to            timestamptz,
  status               tool_request_status,
  distance_m           integer,
  offer_count          integer,
  created_at           timestamptz
)
language sql stable security definer set search_path = public as $$
  select r.id, r.requester_id, p.first_name, r.raw_text, r.parsed_tool_types,
         r.category_id, r.radius_m, r.needed_from, r.needed_to, r.status,
         (round(ST_Distance(r.fuzzed_location,
            ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography) / 50.0) * 50)::int,
         (select count(*)::int from public.tool_request_offers o where o.tool_request_id = r.id),
         r.created_at
    from public.tool_requests r
    join public.profiles p on p.id = r.requester_id
   where r.status = 'open'
     and r.expires_at > now()
     and ST_DWithin(r.fuzzed_location,
           ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography, p_radius_m)
   order by created_at desc
   limit 50;
$$;

-- ---------------------------------------------------------------------
-- Keep conversations.last_message_at current so the inbox can order by it
-- without an aggregate over every message.
-- ---------------------------------------------------------------------
create or replace function public.touch_conversation()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.conversations
     set last_message_at = new.created_at
   where id = new.conversation_id;

  insert into public.notifications (user_id, kind, title, body, route, payload)
  select case when c.owner_id = new.sender_id then c.borrower_id else c.owner_id end,
         'message_received', 'New message', left(new.body, 120),
         'nailedit://chat/' || c.id,
         jsonb_build_object('conversation_id', c.id)
    from public.conversations c
   where c.id = new.conversation_id
     and new.kind <> 'system';

  return new;
end $$;

create trigger messages_touch_conversation
  after insert on public.messages
  for each row execute function public.touch_conversation();

-- ---------------------------------------------------------------------
-- Expire unanswered requests. Run hourly.
-- ---------------------------------------------------------------------
create or replace function public.expire_stale_requests()
returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  update public.borrow_requests
     set status = 'expired'
   where status = 'pending' and expires_at < now();
  get diagnostics n = row_count;
  return n;
end $$;

-- ---------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------
grant execute on function public.create_tool_with_location to authenticated;
grant execute on function public.create_borrow_request     to authenticated;
grant execute on function public.respond_to_request        to authenticated;
grant execute on function public.confirm_return            to authenticated;
grant execute on function public.submit_rating             to authenticated;
grant execute on function public.create_tool_request       to authenticated;
grant execute on function public.nearby_tool_requests      to anon, authenticated;
grant execute on function public.publish_stale_ratings     to service_role;
grant execute on function public.expire_stale_requests     to service_role;
