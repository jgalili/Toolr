\set QUIET on
-- =====================================================================
-- Two regressions, both reported as "nothing happens".
--
--  A. An owner could not DECLINE a request whose window had already gone by,
--     because respond_to_request validated the return time before it looked
--     at the decision. A stale request was therefore stuck in the inbox
--     forever: it could not be accepted (rightly) and could not be got rid of.
--
--  B. Once a loan started, sync_tool_availability() set tools.status =
--     'borrowed', and tools_read_active only exposes 'active'. The borrower —
--     the person actually holding the tool — could no longer read its title
--     or its photos, so their own Borrowing card came out blank.
-- =====================================================================

insert into auth.users (id, email, raw_user_meta_data, email_confirmed_at) values
 ('aaaaaaaa-0000-0000-0000-000000000001','owner@x.com','{"full_name":"Ora Owner"}', now()),
 ('bbbbbbbb-0000-0000-0000-000000000002','borrower@x.com','{"full_name":"Boaz Borrower"}', now()),
 ('cccccccc-0000-0000-0000-000000000003','nosy@x.com','{"full_name":"Noa Nosy"}', now());
grant usage on schema public to anon, authenticated;

\set owner '''aaaaaaaa-0000-0000-0000-000000000001'''
\set borrower '''bbbbbbbb-0000-0000-0000-000000000002'''
\set stranger '''cccccccc-0000-0000-0000-000000000003'''

-- ============ Ora lists two ladders ============
set local role authenticated;
set local request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
set local request.jwt.claims = '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","is_anonymous":false}';

select public.create_tool_with_location(
  'Regression Ladder A','step-ladder','Werner',null,false,'ladders-access',
  'A three-step ladder used only by tests.','good',null,null,
  3::smallint, true, null, 'now'::availability_mode, 'low'::risk_level,
  32.0553, 34.7688, 'Florentin', 'Vital St 12', null
) as ladder_a \gset

select public.create_tool_with_location(
  'Regression Ladder B','step-ladder','Werner',null,false,'ladders-access',
  'A second three-step ladder used only by tests.','good',null,null,
  3::smallint, true, null, 'now'::availability_mode, 'low'::risk_level,
  32.0553, 34.7688, 'Florentin', 'Vital St 12', null
) as ladder_b \gset
reset role;

-- A photo on the ladder that will actually be borrowed, so the photo policy is
-- exercised in the state that broke it. Hanging it on the OTHER ladder would
-- leave the test green against the very schema that shipped the bug.
insert into public.tool_photos (tool_id, storage_path, position)
values (:'ladder_b', 'test/ladder-b.jpg', 0);

-- ============ Boaz asks for ladder A, for a window that then passes ============
set local role authenticated;
set local request.jwt.claim.sub = 'bbbbbbbb-0000-0000-0000-000000000002';
set local request.jwt.claims = '{"sub":"bbbbbbbb-0000-0000-0000-000000000002","is_anonymous":false}';
select (public.create_borrow_request(
  :'ladder_a', now() + interval '1 hour', now() + interval '3 hours', 'Painting a wall.', false)).id as stale_req \gset
select (public.create_borrow_request(
  :'ladder_b', now() + interval '1 hour', now() + interval '3 hours', 'And the other one.', false)).id as live_req \gset
reset role;

-- psql does not interpolate :variables inside dollar-quoted blocks, so hand the
-- ids to the server as settings that plpgsql and later statements can read.
select set_config('test.ladder_a', :'ladder_a', false),
       set_config('test.ladder_b', :'ladder_b', false),
       set_config('test.stale_req', :'stale_req', false),
       set_config('test.live_req',  :'live_req',  false);

-- Time travel, without waiting three hours: push both windows into the past.
update public.borrow_requests
   set start_at = now() - interval '2 days', end_at = now() - interval '1 day'
 where id in (:'stale_req', :'live_req');

-- ============ A. answering a stale request ============
set local role authenticated;
set local request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
set local request.jwt.claims = '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","is_anonymous":false}';

-- Accepting it unchanged must still be refused: agreeing to a date that has
-- gone is not a thing the app should let an owner do by accident.
do $$
declare v_id uuid := current_setting('test.stale_req')::uuid;
begin
  perform public.respond_to_request(v_id, 'accepted');
  raise notice 'ACCEPT of a past window is refused | 0';
exception when others then
  raise notice 'ACCEPT of a past window is refused | 1';
end $$;

-- Declining it must WORK. This is the bug.
do $$
declare v_id uuid := current_setting('test.stale_req')::uuid;
begin
  perform public.respond_to_request(v_id, 'declined');
  raise notice 'DECLINE of a past window works | 1';
exception when others then
  raise notice 'DECLINE of a past window works | 0 (%)', sqlerrm;
end $$;

-- And accepting WITH a new date must work, which is the remedy the app offers.
do $$
declare v_id uuid := current_setting('test.live_req')::uuid;
begin
  perform public.respond_to_request(v_id, 'accepted', now() + interval '2 days');
  raise notice 'ACCEPT with a new return time works | 1';
exception when others then
  raise notice 'ACCEPT with a new return time works | 0 (%)', sqlerrm;
end $$;
reset role;

select 'stale request ended declined' as check,
       (select (status = 'declined')::int::text from public.borrow_requests where id = :'stale_req') as value;

-- ============ B. visibility once the tool is out ============
-- Take ladder B all the way to picked_up, which delists it.
do $$
declare v_tx uuid;
begin
  select id into v_tx from public.transactions where request_id = current_setting('test.live_req')::uuid;
  perform set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', true);
  perform set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","is_anonymous":false}', true);
  perform public.confirm_pickup(v_tx);
end $$;

select 'tool is delisted while out' as check,
       (select (status = 'borrowed')::int::text from public.tools where id = :'ladder_b') as value;

set local role authenticated;
set local request.jwt.claim.sub = 'bbbbbbbb-0000-0000-0000-000000000002';
set local request.jwt.claims = '{"sub":"bbbbbbbb-0000-0000-0000-000000000002","is_anonymous":false}';
select 'BORROWER can still read the borrowed tool | ' ||
       (select count(*) from public.tools where id = current_setting('test.ladder_b')::uuid) as check;
select 'BORROWER can still read its photos | ' ||
       (select count(*) from public.tool_photos where tool_id = current_setting('test.ladder_b')::uuid) as check;
reset role;

-- The counterparty rule must not become a public one.
set local role authenticated;
set local request.jwt.claim.sub = 'cccccccc-0000-0000-0000-000000000003';
set local request.jwt.claims = '{"sub":"cccccccc-0000-0000-0000-000000000003","is_anonymous":false}';
select 'STRANGER cannot read the borrowed tool | ' ||
       (select count(*) from public.tools where id = current_setting('test.ladder_b')::uuid) as check;
select 'STRANGER cannot read the exact location | ' ||
       (select count(*) from public.tool_locations where tool_id = current_setting('test.ladder_b')::uuid) as check;
select 'BORROWER cannot read the exact location either | ' || (
  select count(*) from public.tool_locations
   where tool_id = current_setting('test.ladder_b')::uuid) as check;
reset role;
