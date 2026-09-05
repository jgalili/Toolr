\set QUIET on
-- =====================================================================
-- "It doesn't REALLY count the number of successful exchanges."
--
-- The tests below are the definition of "really": every number the app shows
-- must be reproducible from the rows. So each one is checked twice — once as
-- the running total the triggers maintain, and once against a full recompute.
-- If those two ever disagree, the displayed number is fiction.
-- =====================================================================

insert into auth.users (id, email, raw_user_meta_data, email_confirmed_at) values
 ('a1a1a1a1-0000-0000-0000-000000000001','lender@x.com','{"full_name":"Lena Lender"}', now()),
 ('b2b2b2b2-0000-0000-0000-000000000002','taker@x.com','{"full_name":"Tomer Taker"}', now());
grant usage on schema public to anon, authenticated;

set local role authenticated;
set local request.jwt.claim.sub = 'a1a1a1a1-0000-0000-0000-000000000001';
set local request.jwt.claims = '{"sub":"a1a1a1a1-0000-0000-0000-000000000001","is_anonymous":false}';
select public.create_tool_with_location(
  'Counted Ladder','step-ladder','Werner',null,false,'ladders-access',
  'A ladder that keeps score.','good',null,null,
  3::smallint, true, null, 'now'::availability_mode, 'low'::risk_level,
  32.0553, 34.7688, 'Florentin', 'Vital St 12', null
) as tool \gset
reset role;
select set_config('test.tool', :'tool', false);

-- Fabricate the exact lie the seed used to tell: a profile decorated with a
-- reputation that no row supports.
update public.profiles
   set completed_lends = 23, rating_sum_owner = 92, rating_count_owner = 19
 where id = 'a1a1a1a1-0000-0000-0000-000000000001';

select 'starts out overstated | ' ||
       (select (completed_lends = 23)::int from public.profiles
         where id = 'a1a1a1a1-0000-0000-0000-000000000001') as check;

-- ============ one real loan, start to finish ============
do $$
declare v_req uuid; v_tx uuid;
  c_owner constant text := '{"sub":"a1a1a1a1-0000-0000-0000-000000000001","is_anonymous":false}';
  c_taker constant text := '{"sub":"b2b2b2b2-0000-0000-0000-000000000002","is_anonymous":false}';
begin
  perform set_config('request.jwt.claim.sub','b2b2b2b2-0000-0000-0000-000000000002',true);
  perform set_config('request.jwt.claims', c_taker, true);
  select (public.create_borrow_request(
    current_setting('test.tool')::uuid,
    now() + interval '1 hour', now() + interval '2 days', null, false)).id into v_req;

  perform set_config('request.jwt.claim.sub','a1a1a1a1-0000-0000-0000-000000000001',true);
  perform set_config('request.jwt.claims', c_owner, true);
  perform public.respond_to_request(v_req, 'accepted');

  select id into v_tx from public.transactions where request_id = v_req;
  perform public.confirm_pickup(v_tx);
  perform public.confirm_return(v_tx);

  perform set_config('request.jwt.claim.sub','b2b2b2b2-0000-0000-0000-000000000002',true);
  perform set_config('request.jwt.claims', c_taker, true);
  perform public.confirm_return(v_tx);

  perform set_config('test.tx', v_tx::text, false);
end $$;

select 'the loan completed | ' ||
       (select (status = 'completed')::int from public.transactions
         where id = current_setting('test.tx')::uuid) as check;

-- ============ the tool counts its own exchanges ============
select 'the TOOL counted one exchange | ' ||
       (select completed_exchanges from public.tools where id = :'tool') as check;

-- ============ the recompute is the arbiter ============
select public.recount_exchanges();
select public.recount_tool_exchanges();

select 'recount replaced the invented reputation | ' ||
       (select (completed_lends = 1)::int from public.profiles
         where id = 'a1a1a1a1-0000-0000-0000-000000000001') as check;
select 'a rating with no rows reads as no rating | ' ||
       (select (rating_count_owner = 0 and rating_sum_owner = 0)::int
          from public.profiles where id = 'a1a1a1a1-0000-0000-0000-000000000001') as check;
select 'the borrower is credited too | ' ||
       (select (completed_borrows = 1)::int from public.profiles
         where id = 'b2b2b2b2-0000-0000-0000-000000000002') as check;
select 'the recompute agrees with the trigger | ' ||
       (select completed_exchanges from public.tools where id = :'tool') as check;

-- ============ the counter must not climb on unrelated writes ============
-- The classic counter bug: a trigger that fires on "status = 'completed'"
-- rather than on the TRANSITION into it, so every later touch of the row
-- inflates the total.
update public.transactions set due_at = due_at + interval '1 hour'
 where id = current_setting('test.tx')::uuid;
update public.transactions set status = 'completed'
 where id = current_setting('test.tx')::uuid;

select 'an unrelated update does not inflate it | ' ||
       (select completed_exchanges from public.tools where id = :'tool') as check;

-- ============ and a rating shown is a rating readable ============
insert into public.ratings (transaction_id, rater_id, ratee_id, direction, stars, comment, is_published)
values (current_setting('test.tx')::uuid,
        'b2b2b2b2-0000-0000-0000-000000000002',
        'a1a1a1a1-0000-0000-0000-000000000001',
        'borrower_to_owner', 5, 'Ladder was exactly as described.', true);
select public.recount_exchanges();

select 'the rating count matches the readable rows | ' ||
       (select (p.rating_count_owner = (select count(*) from public.ratings r
                                         where r.ratee_id = p.id and r.is_published
                                           and r.direction = 'borrower_to_owner'))::int
          from public.profiles p where p.id = 'a1a1a1a1-0000-0000-0000-000000000001') as check;
select 'and there is a review behind it | ' ||
       (select count(*) from public.ratings
         where ratee_id = 'a1a1a1a1-0000-0000-0000-000000000001'
           and is_published and comment is not null) as check;
