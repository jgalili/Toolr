-- =====================================================================
-- NailedIt — a live loan in each direction, for the two real test accounts.
--
-- Sets up exactly what is hard to reach by hand when you are testing alone:
-- one tool you have LENT OUT and one you are HOLDING, both physically handed
-- over and both due back next Tuesday evening. That is the state where every
-- control in the lending lifecycle is on screen at once -- "Got it back" on
-- one card, "I returned it" on the other.
--
-- Built by calling the same RPCs the app calls, acting as each account in
-- turn, so it exercises the real path: the request, the acceptance, the
-- conversation, the system messages, the notifications, and the trigger that
-- takes a borrowed tool out of search. Rows poked directly into the tables
-- would prove nothing.
--
-- Safe to run more than once: it does nothing if a live loan already exists
-- between the two accounts in that direction.
-- =====================================================================

do $$
declare
  v_lender    uuid;                          -- jgalili@gmail.com
  v_borrower  uuid;                          -- zany666@gmail.com
  v_hammer    uuid;
  v_ladder    uuid;
  v_req       public.borrow_requests;
  v_tx        uuid;
  v_local     date := (now() at time zone 'Asia/Jerusalem')::date;
  v_tuesday   timestamptz;
  v_from      timestamptz;
  v_cancelled integer := 0;

begin
  select id into v_lender   from auth.users where email = 'jgalili@gmail.com';
  select id into v_borrower from auth.users where email = 'zany666@gmail.com';
  if v_lender is null or v_borrower is null then
    raise exception 'Both accounts must have signed in at least once';
  end if;

  -- Next Tuesday, 18:00 local. dow: Sunday = 0, so Tuesday = 2.
  v_tuesday := ((v_local + (((2 - extract(dow from v_local)::int) + 7) % 7)
                         + case when extract(dow from v_local)::int = 2 then 7 else 0 end)
                + time '18:00') at time zone 'Asia/Jerusalem';
  v_from := now() - interval '1 day';

  -- ------------------------------------------------------------------
  -- Clear the wreckage of the "saved five times" bug: pending requests and
  -- untouched acceptances between these two accounts. Without this the
  -- Activity list is six identical hammers and the sample is invisible.
  -- Only ever touches rows BETWEEN these two accounts, and only ones nobody
  -- has picked up.
  -- ------------------------------------------------------------------
  update public.transactions
     set status = 'cancelled', cancelled_at = now()
   where status = 'agreed'
     and owner_id in (v_lender, v_borrower)
     and borrower_id in (v_lender, v_borrower);
  get diagnostics v_cancelled = row_count;

  update public.borrow_requests
     set status = 'cancelled'
   where status in ('pending', 'accepted')
     and owner_id in (v_lender, v_borrower)
     and borrower_id in (v_lender, v_borrower);

  -- ------------------------------------------------------------------
  -- 1. Something for each of them to lend.
  -- ------------------------------------------------------------------
  select id into v_hammer from public.tools
   where owner_id = v_lender and deleted_at is null and title ilike '%hammer%'
   order by created_at limit 1;

  select id into v_ladder from public.tools
   where owner_id = v_borrower and deleted_at is null and title ilike '%ladder%'
   order by created_at limit 1;

  if v_ladder is null then
    perform set_config('request.jwt.claim.sub', v_borrower::text, true);
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_borrower, 'is_anonymous', false)::text, true);

    -- Placed near the demo neighbourhood so it shows up in the same search.
    v_ladder := public.create_tool_with_location(
      'Aluminium Step Ladder', 'step-ladder', 'Keter', null, false, 'ladders',
      '4-step aluminium ladder, folds flat. Light enough to carry up stairs.',
      'good', null, 'Open it fully before standing on it.',
      7::smallint, true, null, 'now'::availability_mode, 'medium'::risk_level,
      32.0605, 34.7720, 'Florentin', 'Levinsky St 8', 'Ground floor, ring twice.'
    );
  end if;

  if v_hammer is null then
    perform set_config('request.jwt.claim.sub', v_lender::text, true);
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_lender, 'is_anonymous', false)::text, true);

    v_hammer := public.create_tool_with_location(
      'Claw Hammer', 'hammer', 'Stanley', null, false, 'hand-tools',
      '450 g claw hammer, wooden handle.', 'good', null, null,
      14::smallint, true, null, 'now'::availability_mode, 'low'::risk_level,
      32.0553, 34.7688, 'Florentin', 'Vital St 12', 'Second floor, no lift.'
    );
  end if;

  -- ------------------------------------------------------------------
  -- 2. YOU LENT IT OUT: the hammer is with zany666, due Tuesday.
  -- ------------------------------------------------------------------
  perform set_config('request.jwt.claim.sub', v_borrower::text, true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_borrower, 'is_anonymous', false)::text, true);

  v_req := public.create_borrow_request(
    v_hammer, v_from, v_tuesday, 'Hanging some shelves — can I grab the hammer?', false);

  perform set_config('request.jwt.claim.sub', v_lender::text, true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_lender, 'is_anonymous', false)::text, true);
  perform public.respond_to_request(v_req.id, 'accepted', v_tuesday);

  select id into v_tx from public.transactions where request_id = v_req.id;
  perform public.confirm_pickup(v_tx);          -- the owner saw it go

  -- ------------------------------------------------------------------
  -- 3. YOU BORROWED IT: the ladder is with jgalili, due Tuesday.
  -- ------------------------------------------------------------------
  perform set_config('request.jwt.claim.sub', v_lender::text, true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_lender, 'is_anonymous', false)::text, true);

  v_req := public.create_borrow_request(
    v_ladder, v_from, v_tuesday, 'Painting the hallway this weekend — could I borrow the ladder?', false);

  perform set_config('request.jwt.claim.sub', v_borrower::text, true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_borrower, 'is_anonymous', false)::text, true);
  perform public.respond_to_request(v_req.id, 'accepted', v_tuesday);

  select id into v_tx from public.transactions where request_id = v_req.id;

  perform set_config('request.jwt.claim.sub', v_lender::text, true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_lender, 'is_anonymous', false)::text, true);
  perform public.confirm_pickup(v_tx);          -- the borrower picked it up

  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '', true);

  raise notice 'Cancelled % stale loan(s). Two live loans due %.',
    v_cancelled, to_char(v_tuesday at time zone 'Asia/Jerusalem', 'Dy DD Mon HH24:MI');
end $$;

-- What the two accounts should now see.
select tl.title,
       tx.status                                as loan,
       t2.status                                as listing,
       ow.first_name || ' -> ' || bo.first_name as direction,
       to_char(tx.due_at at time zone 'Asia/Jerusalem', 'Dy DD Mon HH24:MI') as due
  from public.transactions tx
  join public.tools tl on tl.id = tx.tool_id
  join public.tools t2 on t2.id = tx.tool_id
  join public.profiles ow on ow.id = tx.owner_id
  join public.profiles bo on bo.id = tx.borrower_id
 where tx.status = 'picked_up'
   and ow.id in (select id from auth.users where email in ('jgalili@gmail.com','zany666@gmail.com'))
 order by tx.created_at desc;
