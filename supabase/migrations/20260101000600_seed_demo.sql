-- =====================================================================
-- NailedIt — demo seed data (Tel Aviv)
--
-- DEMO/DEVELOPMENT ONLY. Never run against a real user base: it creates
-- auth users with known ids and no password.
--
-- Everything is written through the same RPCs real data goes through, so
-- the location-fuzzing trigger, the RLS policies and every constraint are
-- exercised exactly as they will be in production. Seeding must never take
-- a path production won't — a seed that bypasses the triggers is how you
-- end up with demo rows that could not legally exist.
--
-- Re-runnable: it does nothing if tools already exist.
-- =====================================================================

do $$
declare
  v_daniel uuid := '00000000-0000-4000-a000-000000000001';
  v_adi    uuid := '00000000-0000-4000-a000-000000000002';
  v_michal uuid := '00000000-0000-4000-a000-000000000003';
  v_omer   uuid := '00000000-0000-4000-a000-000000000004';
  v_noa    uuid := '00000000-0000-4000-a000-000000000005';
  v_dana   uuid := '00000000-0000-4000-a000-000000000006';
  v_lat    double precision := 32.0553;   -- Florentin, Tel Aviv
  v_lng    double precision := 34.7688;
  v_tool   uuid;
  v_drill  uuid;
  v_req    public.borrow_requests;
  v_conv   uuid;
  r        record;
begin
  if exists (select 1 from public.tools limit 1) then
    raise notice 'Seed skipped — tools already exist.';
    return;
  end if;

  insert into auth.users (id, email, raw_user_meta_data, email_confirmed_at)
  values
    (v_daniel, 'daniel@example.com', '{"full_name":"Daniel Avrahami"}'::jsonb, now()),
    (v_adi,    'adi@example.com',    '{"full_name":"Adi Bar"}'::jsonb,         now()),
    (v_michal, 'michal@example.com', '{"full_name":"Michal Gur"}'::jsonb,      now()),
    (v_omer,   'omer@example.com',   '{"full_name":"Omer Katz"}'::jsonb,       now()),
    (v_noa,    'noa@example.com',    '{"full_name":"Noa Shani"}'::jsonb,       now()),
    (v_dana,   'dana@example.com',   '{"full_name":"Dana Cohen"}'::jsonb,      now())
  on conflict (id) do nothing;

  update public.profiles set neighborhood_label = 'Dizengoff Center' where id = v_daniel;
  update public.profiles set neighborhood_label = 'Florentin'        where id in (v_adi, v_omer, v_dana);
  update public.profiles set neighborhood_label = 'Neve Tzedek'      where id = v_michal;
  update public.profiles set neighborhood_label = 'Shapira'          where id = v_noa;

  -- Reputations chosen so the *displayed* (Bayesian-smoothed) score lands on
  -- the number the designs show. smoothed = (sum + 4.6*5) / (n + 5), so a
  -- raw average alone would not reproduce them.
  update public.profiles set rating_sum_owner = 60, rating_count_owner = 12,
         completed_lends = 12, verification_level = 'phone' where id = v_daniel;  -- 4.9
  update public.profiles set rating_sum_owner = 92, rating_count_owner = 19,
         completed_lends = 23 where id = v_adi;                                    -- 4.8
  update public.profiles set rating_sum_owner = 43, rating_count_owner = 9,
         completed_lends = 11, verification_level = 'phone' where id = v_michal;   -- 4.7
  update public.profiles set rating_sum_owner = 32, rating_count_owner = 7,
         completed_lends = 9 where id = v_omer;                                    -- 4.6
  update public.profiles set rating_sum_owner = 75, rating_count_owner = 15,
         completed_lends = 18, verification_level = 'phone' where id = v_noa;      -- 4.9
  update public.profiles set rating_sum_owner = 31, rating_count_owner = 6,
         completed_lends = 6, completed_borrows = 4 where id = v_dana;             -- 4.9

  -- ------------------------------------------------------------------
  -- The catalogue.
  --
  -- Offsets are metres north/east of the Florentin centre, chosen so the
  -- rounded distances read the way the designs do: the drill at ~300 m, the
  -- jigsaw at 550, the ladder at 700, the washer at 1.2 km.
  -- ------------------------------------------------------------------
  for r in
    select * from (values
      (v_daniel, 'Bosch Cordless Drill',      'cordless-drill',  'Bosch',        'GSB 18V-55', true,  'power-tools', true,  null::bigint, 'now',   'medium',   180,  220, 'Dizengoff Center', 'good',     '18V cordless drill suitable for wood, metal and light masonry. Includes battery and charger.'),
      (v_adi,    'Makita Jigsaw',             'jigsaw',          'Makita',       null,         false, 'woodworking', false, 1500::bigint, 'dates', 'high',    -320,  450, 'Florentin',        'good',     'Corded jigsaw for curves in wood and thin metal. Comes with three blades.'),
      (v_michal, '3 m Ladder',                'ladder',          null,           null,         false, 'ladders',     true,  null::bigint, 'ask',   'medium',   560, -420, 'Neve Tzedek',      'good',     'Three-metre folding ladder. Light enough to carry, heavy enough to feel safe.'),
      (v_noa,    'Karcher Pressure Washer',   'pressure-washer', 'Karcher',      'K5',         false, 'cleaning',    false, 2500::bigint, 'dates', 'medium', -1050,  600, 'Shapira',          'like_new', 'Pressure washer for balconies, tiles and bikes. Hose and two nozzles included.'),
      (v_adi,    'Makita Rotary Hammer',      'rotary-hammer',   'Makita',       null,         false, 'power-tools', false, 1800::bigint, 'ask',   'high',     520,  390, 'Florentin',        'good',     'SDS rotary hammer for concrete. Three masonry bits included.'),
      (v_omer,   'Black+Decker Drill Set',    'drill-set',       'Black+Decker', null,         false, 'power-tools', true,  null::bigint, 'now',   'medium',  -980, -420, 'Shapira',          'worn',     'Drill plus a full bit set in a hard case. Good for flat-pack and picture hooks.'),
      (v_adi,    'Hedge Trimmer',             'hedge-trimmer',   'Ryobi',        null,         false, 'gardening',   true,  null::bigint, 'now',   'high',   -1750, -900, 'Florentin',        'good',     'Electric hedge trimmer, 45 cm blade. Good for a balcony hedge or small garden.'),
      (v_dana,   'Screwdriver & Spanner Set', 'socket-set',      null,           null,         false, 'hand-tools',  true,  null::bigint, 'now',   'low',     1450, -520, 'Florentin',        'good',     'A full set of screwdrivers and spanners in a case. Enough for most flat-pack jobs.'),
      (v_noa,    'Manual Tile Cutter',        'tile-cutter',     'Rubi',         null,         false, 'home-repair', false, 2000::bigint, 'dates', 'medium', -1500,  700, 'Shapira',          'good',     'Manual tile cutter up to 60 cm. Clean cuts on ceramic, harder work on porcelain.'),
      (v_michal, 'Paint Roller Kit & Tray',   'paint-sprayer',   null,           null,         false, 'painting',    true,  null::bigint, 'now',   'low',     2000,-1200, 'Florentin',        'good',     'Two rollers, an extension pole and a tray. Washed and ready.'),
      (v_omer,   'Folding Hand Trolley',      'tool-trolley',    null,           null,         false, 'moving',      true,  null::bigint, 'ask',   'low',    -1700,  750, 'Florentin',        'worn',     'Folding trolley, takes about 70 kg. Saved me three trips up four floors.'),
      (v_michal, '4-Person Tent',             'tent',            'Coleman',      null,         false, 'camping',     false, 4000::bigint, 'dates', 'low',     1900, -900, 'Neve Tzedek',      'good',     'Four-person tent, dry and complete. Pegs and poles all present.'),
      (v_noa,    'Electric Lawn Mower',       'lawn-mower',      'Bosch',        null,         false, 'gardening',   false, 3500::bigint, 'ask',   'high',   -2400, 1100, 'Shapira',          'good',     'Corded mower for a small garden. Grass box included.'),
      (v_daniel, 'Stud & Cable Detector',     'stud-detector',   'Bosch',        'Truvo',      true,  'home-repair', true,  null::bigint, 'now',   'low',     1600,  700, 'Dizengoff Center', 'like_new', 'Finds studs, metal and live wiring before you drill. Takes one 9V battery.')
    ) as t(owner, title, tool_type, brand, model, confirmed, category, is_free, price,
           availability, risk, north_m, east_m, hood, cond, description)
  loop
    -- Act as the owner, so create_tool_with_location's own auth checks run.
    perform set_config('request.jwt.claim.sub', r.owner::text, true);
    perform set_config(
      'request.jwt.claims',
      json_build_object('sub', r.owner, 'is_anonymous', false)::text,
      true
    );

    v_tool := public.create_tool_with_location(
      r.title, r.tool_type, r.brand, r.model, r.confirmed, r.category,
      r.description, r.cond, null, null, 3::smallint,
      r.is_free, r.price, r.availability::availability_mode, r.risk::risk_level,
      v_lat + r.north_m / 111320.0,
      v_lng + r.east_m / (111320.0 * cos(radians(v_lat))),
      r.hood,
      'Seed address — demo data only',
      null
    );

    if r.title = 'Bosch Cordless Drill' then
      v_drill := v_tool;
    end if;

    -- Evening pickup windows on every day, so "Available today" is never
    -- empty in a demo — a real listing would be sparser.
    insert into public.tool_pickup_windows (tool_id, weekday, start_time, end_time)
    select v_tool, d, s.a, s.b
    from generate_series(0, 6) as d,
         (values ('18:00'::time, '20:00'::time), ('20:00'::time, '22:00'::time)) as s(a, b)
    on conflict do nothing;

    -- What's in the box, for the tools where it changes the decision.
    if r.tool_type = 'cordless-drill' then
      insert into public.tool_included_items (tool_id, label, icon, position) values
        (v_tool, '18V Battery', 'battery', 0),
        (v_tool, 'Charger', 'charger', 1),
        (v_tool, 'Case', 'case', 2);
    elsif r.tool_type = 'drill-set' then
      insert into public.tool_included_items (tool_id, label, icon, position) values
        (v_tool, 'Battery', 'battery', 0),
        (v_tool, 'Charger', 'charger', 1),
        (v_tool, 'Bit set', 'case', 2);
    elsif r.tool_type = 'rotary-hammer' then
      insert into public.tool_included_items (tool_id, label, icon, position) values
        (v_tool, '3 SDS bits', 'item', 0),
        (v_tool, 'Side handle', 'item', 1),
        (v_tool, 'Case', 'case', 2);
    elsif r.tool_type = 'jigsaw' then
      insert into public.tool_included_items (tool_id, label, icon, position) values
        (v_tool, '3 blades', 'item', 0),
        (v_tool, 'Case', 'case', 1);
    elsif r.tool_type = 'pressure-washer' then
      insert into public.tool_included_items (tool_id, label, icon, position) values
        (v_tool, 'Hose', 'item', 0),
        (v_tool, '2 nozzles', 'item', 1),
        (v_tool, 'Detergent', 'item', 2);
    end if;
  end loop;

  -- ------------------------------------------------------------------
  -- One exchange in flight, so the Messages tab is not an empty state.
  -- Dana is borrowing Daniel's drill; the request is accepted, which is
  -- what creates the transaction and the conversation.
  -- ------------------------------------------------------------------
  perform set_config('request.jwt.claim.sub', v_dana::text, true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_dana, 'is_anonymous', false)::text, true);

  v_req := public.create_borrow_request(
    v_drill,
    date_trunc('day', now()) + interval '18 hours 30 minutes',
    date_trunc('day', now()) + interval '1 day 21 hours',
    'Hi Daniel, can I borrow the drill today around 18:30?',
    true
  );

  perform set_config('request.jwt.claim.sub', v_daniel::text, true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_daniel, 'is_anonymous', false)::text, true);

  perform public.respond_to_request(v_req.id, 'accepted');

  select id into v_conv from public.conversations where request_id = v_req.id;

  insert into public.messages (conversation_id, sender_id, kind, body, created_at) values
    (v_conv, v_dana,   'text', 'Hi Daniel, can I borrow the drill today around 18:30?', now() - interval '24 minutes'),
    (v_conv, v_daniel, 'text', 'Yes — no problem. I''ll be home after 18:00.',          now() - interval '22 minutes'),
    (v_conv, v_dana,   'text', 'Perfect, thanks!',                                      now() - interval '21 minutes'),
    (v_conv, v_daniel, 'text', 'Pickup near Dizengoff Center.',                         now() - interval '12 minutes');

  -- ------------------------------------------------------------------
  -- One pending request the other way round, so the Requests tab has
  -- something to accept or decline.
  -- ------------------------------------------------------------------
  perform set_config('request.jwt.claim.sub', v_omer::text, true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_omer, 'is_anonymous', false)::text, true);

  select id into v_tool from public.tools
   where owner_id = v_dana and title = 'Screwdriver & Spanner Set';

  perform public.create_borrow_request(
    v_tool,
    now() + interval '1 day',
    now() + interval '2 days',
    'Assembling a wardrobe tomorrow evening — could I grab it around 18:00?',
    false
  );

  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '', true);

  raise notice 'Seeded % tools, % pickup windows, % included items.',
    (select count(*) from public.tools),
    (select count(*) from public.tool_pickup_windows),
    (select count(*) from public.tool_included_items);
end $$;
