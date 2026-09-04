-- ============ setup: one member who owns a tool ============
insert into auth.users (id, email, raw_user_meta_data, email_confirmed_at)
values ('11111111-1111-1111-1111-111111111111','yossi@x.com','{"full_name":"Yossi Levi"}', now());

insert into public.tools (id, owner_id, category_id, title, tool_type, payment_mode,
                          availability_mode, status, fuzzed_location, neighborhood_label)
values ('aaaaaaaa-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111',1,
        'Bosch Cordless Drill','cordless-drill','free','now','active',
        ST_SetSRID(ST_MakePoint(34.7688,32.0553),4326)::geography,'Florentin');

select '1. member auto-provisioned profile' as check,
       (select count(*)::text from public.profiles where id='11111111-1111-1111-1111-111111111111') as value;
select '2. member verification_level' as check,
       (select verification_level::text from public.profiles where id='11111111-1111-1111-1111-111111111111') as value;

-- ============ a guest arrives ============
insert into auth.users (id, is_anonymous) values ('99999999-9999-9999-9999-999999999999', true);

select '3. guest got NO profile row' as check,
       (select count(*)::text from public.profiles where id='99999999-9999-9999-9999-999999999999') as value;

grant usage on schema public to anon, authenticated;

-- act as the guest
set local role authenticated;
set local request.jwt.claim.sub = '99999999-9999-9999-9999-999999999999';
set local request.jwt.claims = '{"sub":"99999999-9999-9999-9999-999999999999","is_anonymous":true}';

select '4. is_member() for a guest' as check, public.is_member()::text as value;
select '5. guest can browse tools' as check, count(*)::text as value from public.tools;
select '6. guest can search nearby' as check, count(*)::text as value
  from public.search_tools_nearby(32.0553, 34.7688, 1000);

-- guest favourites a tool: allowed
insert into public.favorites (user_id, tool_id)
values ('99999999-9999-9999-9999-999999999999','aaaaaaaa-0000-0000-0000-000000000001');
select '7. guest CAN favourite' as check, count(*)::text as value from public.favorites;

-- guest tries to borrow: must be refused by RLS
do $$
begin
  insert into public.borrow_requests (tool_id, borrower_id, owner_id, start_at, end_at)
  values ('aaaaaaaa-0000-0000-0000-000000000001','99999999-9999-9999-9999-999999999999',
          '11111111-1111-1111-1111-111111111111', now()+interval '1 day', now()+interval '2 days');
  raise notice '8. guest CANNOT borrow ........ FAIL - insert succeeded';
exception when insufficient_privilege then
  raise notice '8. guest CANNOT borrow ........ PASS (RLS refused)';
end $$;

reset role;

-- ============ the guest upgrades in place ============
update auth.users
   set is_anonymous = false, email = 'dana@x.com', email_confirmed_at = now(),
       raw_user_meta_data = '{"full_name":"Dana Cohen"}'::jsonb
 where id = '99999999-9999-9999-9999-999999999999';

select '9. profile created on upgrade' as check,
       (select first_name from public.profiles where id='99999999-9999-9999-9999-999999999999') as value;
select '10. favourite survived upgrade' as check,
       (select count(*)::text from public.favorites where user_id='99999999-9999-9999-9999-999999999999') as value;

-- now act as the upgraded member
set local role authenticated;
set local request.jwt.claim.sub = '99999999-9999-9999-9999-999999999999';
set local request.jwt.claims = '{"sub":"99999999-9999-9999-9999-999999999999","is_anonymous":false}';
select '11. is_member() after upgrade' as check, public.is_member()::text as value;
insert into public.borrow_requests (tool_id, borrower_id, owner_id, start_at, end_at)
values ('aaaaaaaa-0000-0000-0000-000000000001','99999999-9999-9999-9999-999999999999',
        '11111111-1111-1111-1111-111111111111', now()+interval '1 day', now()+interval '2 days');
select '12. member CAN borrow' as check, count(*)::text as value from public.borrow_requests;
reset role;

-- ============ verification never downgrades ============
update public.profiles set verification_level='phone' where id='11111111-1111-1111-1111-111111111111';
update auth.users set email_confirmed_at = now() where id='11111111-1111-1111-1111-111111111111';
select '13. phone not downgraded to email' as check,
       (select verification_level::text from public.profiles where id='11111111-1111-1111-1111-111111111111') as value;

-- ============ stale guest purge ============
insert into auth.users (id, is_anonymous, created_at, last_sign_in_at)
values ('88888888-8888-8888-8888-888888888888', true, now()-interval '90 days', now()-interval '60 days');
select '14. purge_stale_guests removed' as check, public.purge_stale_guests()::text as value;
