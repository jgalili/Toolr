\set QUIET on
-- members
insert into auth.users (id, email, raw_user_meta_data, email_confirmed_at) values
 ('11111111-1111-1111-1111-111111111111','yossi@x.com','{"full_name":"Yossi Levi"}', now()),
 ('22222222-2222-2222-2222-222222222222','dana@x.com','{"full_name":"Dana Cohen"}', now());
-- a guest
insert into auth.users (id, is_anonymous) values ('99999999-9999-9999-9999-999999999999', true);
grant usage on schema public to anon, authenticated;


-- ============ 1. Yossi lists a drill ============
set local role authenticated;
set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","is_anonymous":false}';

select public.create_tool_with_location(
  'Bosch Cordless Drill','cordless-drill','Bosch',null,false,'power-tools',
  '18V cordless drill for wood, metal and light masonry.','good','Battery and charger',null,
  3::smallint, true, null, 'now'::availability_mode, 'medium'::risk_level,
  32.0553, 34.7688, 'Florentin', 'Vital St 12', 'Second floor, no lift.'
) as new_tool_id \gset

select '1. tool created' as check, (select count(*)::text from public.tools where id = :'new_tool_id') as value;
reset role;
select '2. exact point is in tool_locations' as check,
       (select count(*)::text from public.tool_locations where tool_id = :'new_tool_id') as value;
select '3. fuzz offset (m)' as check,
       (select round(ST_Distance(t.fuzzed_location, tl.exact_location)::numeric,1)::text
          from public.tools t join public.tool_locations tl on tl.tool_id = t.id
         where t.id = :'new_tool_id') as value;

-- ============ 2. a guest cannot borrow ============
set local role authenticated;
set local request.jwt.claim.sub = '99999999-9999-9999-9999-999999999999';
set local request.jwt.claims = '{"sub":"99999999-9999-9999-9999-999999999999","is_anonymous":true}';
do $$
declare v_tool uuid;
begin
  select id into v_tool from public.tools
   where title = 'Bosch Cordless Drill' and owner_id = '11111111-1111-1111-1111-111111111111';
  perform public.create_borrow_request(
    v_tool, now() + interval '1 day', now() + interval '2 days', null, false);
  raise notice '4. guest CANNOT borrow ............ FAIL';
exception when others then
  raise notice '4. guest CANNOT borrow ............ PASS (%)', sqlerrm;
end $$;
reset role;

-- ============ 3. Dana borrows ============
set local role authenticated;
set local request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","is_anonymous":false}';

select (public.create_borrow_request(
  :'new_tool_id', now() + interval '1 day', now() + interval '3 days',
  'Hanging a shelf, need it for an hour.', false)).id as req_id \gset
select '5. request created' as check, :'req_id' as value;

-- Must target the SAME tool, or this asserts nothing. It quietly stopped
-- asserting the moment seed data made `limit 1` pick a different row.
do $$
declare v_tool uuid;
begin
  select id into v_tool from public.tools
   where title = 'Bosch Cordless Drill' and owner_id = '11111111-1111-1111-1111-111111111111';
  perform public.create_borrow_request(
    v_tool, now() + interval '1 day', now() + interval '2 days', null, false);
  raise notice '6. duplicate request blocked ...... FAIL';
exception when others then
  raise notice '6. duplicate request blocked ...... PASS (%)', sqlerrm;
end $$;

select '7. borrower reads tool_locations' as check, count(*)::text as value from public.tool_locations;

-- A pending request creates no transaction, and with no transaction there is
-- nothing get_pickup_location can hand over. Both halves are asserted, because
-- the second one is only meaningful while the first one holds -- and it must
-- name THIS request: `limit 1` picked whichever transaction the demo seed
-- happened to leave behind, and then asserted nothing at all.
select '8. no transaction before accept' as check, count(*)::text as value
  from public.transactions where request_id = :'req_id';
select '8b. pickup BEFORE accept' as check, count(*)::text as value
  from public.get_pickup_location(
    (select id from public.transactions where request_id = :'req_id'));
reset role;

-- ============ 4. Yossi accepts ============
set local role authenticated;
set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","is_anonymous":false}';
select public.respond_to_request(:'req_id', 'accepted');
reset role;

-- Every count below is scoped to THIS request. Unscoped counts pass or fail on
-- how much demo data the migrations seeded, which is not what is under test.
select '9. transaction created' as check,
       (select count(*)::text from public.transactions where request_id = :'req_id') as value;
select '10. conversation created' as check,
       (select count(*)::text from public.conversations where request_id = :'req_id') as value;
select '11. system message posted' as check,
       (select count(*)::text from public.messages
         where kind='system'
           and conversation_id = (select id from public.conversations where request_id = :'req_id')) as value;
select '12. owner+borrower notified' as check,
       (select count(*)::text from public.notifications
         where payload->>'request_id' = :'req_id') as value;

select id as tx_id from public.transactions where request_id = :'req_id' \gset
select id as conv_id from public.conversations where request_id = :'req_id' \gset

-- ============ 4b. a reservation does not take the tool off the map ============
-- Accepting for next Tuesday must not hide a drill for a week. It is spoken
-- for on those dates and still borrowable in the meantime.
select '20. RESERVED tool still listed' as check, count(*)::text as value
  from public.search_tools_nearby(32.0553, 34.7688, 1000) where id = :'new_tool_id';
select '21. reserved window is public' as check, count(*)::text as value
  from public.reserved_windows(array[:'new_tool_id']::uuid[]) where is_out = false;

-- ============ 5. pickup address released ============
set local role authenticated;
set local request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","is_anonymous":false}';
select '13. pickup AFTER accept' as check, coalesce(max(address_line),'(none)') as value
  from public.get_pickup_location(:'tx_id');

insert into public.messages (conversation_id, sender_id, kind, body)
values (:'conv_id', '22222222-2222-2222-2222-222222222222','text','Great — see you at 18:00.');
select '14. last_message_at touched' as check,
       (select (last_message_at is not null)::text
          from public.conversations where id = :'conv_id') as value;

-- ============ 5b. it changes hands ============
select public.confirm_pickup(:'tx_id');
select '22. status after pickup' as check,
       (select status::text from public.transactions where id = :'tx_id') as value;
reset role;

-- Gone from the neighbourhood, so gone from search.
select '23. BORROWED tool is delisted' as check, count(*)::text as value
  from public.search_tools_nearby(32.0553, 34.7688, 1000) where id = :'new_tool_id';
select '24. listing marked borrowed' as check,
       (select status::text from public.tools where id = :'new_tool_id') as value;

-- ============ 6. the borrower says they gave it back ============
-- A claim, not a fact: the tool stays delisted until the owner agrees.
set local role authenticated;
set local request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","is_anonymous":false}';
select public.confirm_return(:'tx_id');
reset role;
select '25. STILL delisted on borrower say-so' as check, count(*)::text as value
  from public.search_tools_nearby(32.0553, 34.7688, 1000) where id = :'new_tool_id';

-- ============ 7. the owner confirms, and only now is it available ============
set local role authenticated;
set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","is_anonymous":false}';
select public.confirm_return(:'tx_id');
reset role;
select '26. RELISTED after owner confirms' as check, count(*)::text as value
  from public.search_tools_nearby(32.0553, 34.7688, 1000) where id = :'new_tool_id';

set local role authenticated;
set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","is_anonymous":false}';
select '15. transaction completed' as check,
       (select status::text from public.transactions where id = :'tx_id') as value;
select '16. owner completed_lends' as check,
       (select completed_lends::text from public.profiles where id = '11111111-1111-1111-1111-111111111111') as value;
select public.submit_rating(:'tx_id', 5::smallint, array['as_described'], 'Easy and friendly.');
reset role;

set local role authenticated;
set local request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","is_anonymous":false}';
select public.submit_rating(:'tx_id', 5::smallint, array['on_time'], 'Thanks!');
reset role;

select '17. ratings published (both in)' as check,
       (select count(*) filter (where is_published)::text
          from public.ratings where transaction_id = :'tx_id') as value;
select '18. owner reputation updated' as check,
       (select rating_count_owner::text from public.profiles where id = '11111111-1111-1111-1111-111111111111') as value;

-- ============ 6. search returns the listing with the new columns ============
select '19. search finds the tool it created' as check, count(*)::text as value
  from public.search_tools_nearby(32.0553, 34.7688, 1000)
 where id = :'new_tool_id';
select title, category_slug, distance_m, payment_mode
  from public.search_tools_nearby(32.0553, 34.7688, 1000)
 where id = :'new_tool_id';
