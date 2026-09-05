\set QUIET on
-- =====================================================================
-- "I can't change the details after I publish, and I can't delete items."
--
-- What the fix must get right, beyond simply writing the columns:
--   - only the owner may edit or remove;
--   - an edit that names one field must not blank the others;
--   - a listing cannot be made paid without a price (the same rule create
--     enforces, which is the whole reason to have one write path per action
--     rather than an UPDATE policy);
--   - moving a tool re-fuzzes its PUBLIC point and never publishes the exact
--     one;
--   - a tool that is out on loan cannot be deleted out from under the loan.
-- =====================================================================

insert into auth.users (id, email, raw_user_meta_data, email_confirmed_at) values
 ('dddddddd-0000-0000-0000-000000000001','ed@x.com','{"full_name":"Ed Editor"}', now()),
 ('eeeeeeee-0000-0000-0000-000000000002','mal@x.com','{"full_name":"Mal Meddler"}', now());
grant usage on schema public to anon, authenticated;

set local role authenticated;
set local request.jwt.claim.sub = 'dddddddd-0000-0000-0000-000000000001';
set local request.jwt.claims = '{"sub":"dddddddd-0000-0000-0000-000000000001","is_anonymous":false}';
select public.create_tool_with_location(
  'Edit Me Drill','cordless-drill','Bosch',null,false,'power-tools',
  'The original description.','good','Two batteries','Charge it first.',
  3::smallint, true, null, 'now'::availability_mode, 'low'::risk_level,
  32.0553, 34.7688, 'Florentin', 'Vital St 12', 'Second floor.'
) as tool \gset
reset role;
select set_config('test.tool', :'tool', false);

-- ============ 1. a stranger cannot edit it ============
set local role authenticated;
set local request.jwt.claim.sub = 'eeeeeeee-0000-0000-0000-000000000002';
set local request.jwt.claims = '{"sub":"eeeeeeee-0000-0000-0000-000000000002","is_anonymous":false}';
do $$
begin
  perform public.update_tool(current_setting('test.tool')::uuid, p_title => 'Mine now');
  raise notice 'STRANGER cannot edit | 0';
exception when others then
  raise notice 'STRANGER cannot edit | 1';
end $$;
do $$
begin
  perform public.remove_tool(current_setting('test.tool')::uuid);
  raise notice 'STRANGER cannot remove | 0';
exception when others then
  raise notice 'STRANGER cannot remove | 1';
end $$;
reset role;

-- ============ 2. the owner changes the price and availability ============
set local role authenticated;
set local request.jwt.claim.sub = 'dddddddd-0000-0000-0000-000000000001';
set local request.jwt.claims = '{"sub":"dddddddd-0000-0000-0000-000000000001","is_anonymous":false}';
select public.update_tool(
  current_setting('test.tool')::uuid,
  p_is_free => false,
  p_price_per_day_agorot => 1500,
  p_availability_mode => 'ask'::availability_mode
);
reset role;

select 'price was changed | ' ||
       (select (price_per_day_agorot = 1500 and payment_mode = 'offline')::int
          from public.tools where id = :'tool') as check;
select 'availability was changed | ' ||
       (select (availability_mode = 'ask')::int from public.tools where id = :'tool') as check;
-- The bug this guards: an edit screen that sends only the fields on it, and a
-- function that treats "absent" as "null", empties everything else.
select 'untouched fields survived the edit | ' ||
       (select (description = 'The original description.'
            and accessories = 'Two batteries'
            and instructions = 'Charge it first.'
            and title = 'Edit Me Drill')::int
          from public.tools where id = :'tool') as check;

-- ============ 3. paid with no price is still refused ============
set local role authenticated;
set local request.jwt.claim.sub = 'dddddddd-0000-0000-0000-000000000001';
set local request.jwt.claims = '{"sub":"dddddddd-0000-0000-0000-000000000001","is_anonymous":false}';
do $$
begin
  perform public.update_tool(current_setting('test.tool')::uuid,
                             p_is_free => false, p_price_per_day_agorot => 0);
  raise notice 'PAID with no price is refused | 0';
exception when others then
  raise notice 'PAID with no price is refused | 1';
end $$;

-- Going back to free must clear the price, not leave it dangling.
select public.update_tool(current_setting('test.tool')::uuid, p_is_free => true);
reset role;
select 'free listing carries no price | ' ||
       (select (payment_mode = 'free' and price_per_day_agorot is null)::int
          from public.tools where id = :'tool') as check;

-- ============ 4. clearing a field on purpose ============
set local role authenticated;
set local request.jwt.claim.sub = 'dddddddd-0000-0000-0000-000000000001';
set local request.jwt.claims = '{"sub":"dddddddd-0000-0000-0000-000000000001","is_anonymous":false}';
select public.update_tool(current_setting('test.tool')::uuid, p_clear_accessories => true);
reset role;
select 'an explicit clear does clear | ' ||
       (select (accessories is null and instructions is not null)::int
          from public.tools where id = :'tool') as check;

-- ============ 5. moving it re-fuzzes the public point ============
select fuzzed_location::text as before_point from public.tools where id = :'tool' \gset
set local role authenticated;
set local request.jwt.claim.sub = 'dddddddd-0000-0000-0000-000000000001';
set local request.jwt.claims = '{"sub":"dddddddd-0000-0000-0000-000000000001","is_anonymous":false}';
select public.update_tool(current_setting('test.tool')::uuid,
                          p_lat => 32.0700, p_lng => 34.7900,
                          p_address_line => 'Dizengoff 100');
reset role;
select 'the public point moved | ' ||
       (select (fuzzed_location::text <> :'before_point')::int
          from public.tools where id = :'tool') as check;
select 'the exact point is still only in tool_locations | ' ||
       (select (ST_Distance(t.fuzzed_location, tl.exact_location) > 1)::int
          from public.tools t join public.tool_locations tl on tl.tool_id = t.id
         where t.id = :'tool') as check;
select 'the new address was saved | ' ||
       (select (address_line = 'Dizengoff 100')::int
          from public.tool_locations where tool_id = :'tool') as check;

-- ============ 6. removal ============
-- Someone asks for it, so removal has a pending request to tidy up.
set local role authenticated;
set local request.jwt.claim.sub = 'eeeeeeee-0000-0000-0000-000000000002';
set local request.jwt.claims = '{"sub":"eeeeeeee-0000-0000-0000-000000000002","is_anonymous":false}';
select (public.create_borrow_request(
  current_setting('test.tool')::uuid, now() + interval '1 day', now() + interval '2 days',
  'Can I borrow it?', false)).id as req \gset
reset role;
select set_config('test.req', :'req', false);

-- Accepted, so the tool is genuinely committed: removal must be refused.
set local role authenticated;
set local request.jwt.claim.sub = 'dddddddd-0000-0000-0000-000000000001';
set local request.jwt.claims = '{"sub":"dddddddd-0000-0000-0000-000000000001","is_anonymous":false}';
select public.respond_to_request(current_setting('test.req')::uuid, 'accepted');
do $$
begin
  perform public.remove_tool(current_setting('test.tool')::uuid);
  raise notice 'CANNOT remove a tool that is on loan | 0';
exception when others then
  raise notice 'CANNOT remove a tool that is on loan | 1';
end $$;
reset role;

-- Finish the loan, then removal is allowed.
update public.transactions set status = 'completed'
 where tool_id = current_setting('test.tool')::uuid;

set local role authenticated;
set local request.jwt.claim.sub = 'dddddddd-0000-0000-0000-000000000001';
set local request.jwt.claims = '{"sub":"dddddddd-0000-0000-0000-000000000001","is_anonymous":false}';
do $$
begin
  perform public.remove_tool(current_setting('test.tool')::uuid);
  raise notice 'CAN remove a tool once the loan is done | 1';
exception when others then
  raise notice 'CAN remove a tool once the loan is done | 0 (%)', sqlerrm;
end $$;

-- And it is gone from the owner's own list, not just from search. This was
-- its own small bug: tools_read_own did not check deleted_at, so a removed
-- listing stayed in My Tools forever.
select 'removed listing leaves MY TOOLS too | ' ||
       (select count(*) from public.tools
         where id = current_setting('test.tool')::uuid) as check;
reset role;

-- The row survives, so history keeps its title.
select 'the record is kept for history | ' ||
       (select (deleted_at is not null and title = 'Edit Me Drill')::int
          from public.tools where id = :'tool') as check;
