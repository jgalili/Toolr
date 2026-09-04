insert into auth.users (id, email, raw_user_meta_data, email_confirmed_at) values
 ('11111111-1111-1111-1111-111111111111','yossi@x.com','{"full_name":"Yossi"}', now()),
 ('22222222-2222-2222-2222-222222222222','dana@x.com','{"full_name":"Dana"}', now());
grant usage on schema public to anon, authenticated;

set local role authenticated;
set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","is_anonymous":false}';
select public.create_tool_with_location('Drill','cordless-drill','Bosch',null,false,'power-tools',
  null,null,null,null,3::smallint,true,null,'now'::availability_mode,'medium'::risk_level,
  32.0553,34.7688,'Florentin','Vital St 12',null) as tid \gset
reset role;

set local role authenticated;
set local request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","is_anonymous":false}';
select (public.create_borrow_request(:'tid', now()+interval '1 day', now()+interval '2 days', null, false)).id as rid \gset
reset role;

set local role authenticated;
set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","is_anonymous":false}';
select public.respond_to_request(:'rid','accepted');
reset role;

-- Scoped to the transaction this test created. An unscoped count also counts
-- whatever the demo seed left in the table, which is not what is under test.
select 'before: transactions' as check,
       (select count(*)::text from public.transactions where request_id = :'rid') as value;

-- Simulate what the delete-account function does for the BORROWER (Dana)
update public.messages set body = '[deleted]' where sender_id = '22222222-2222-2222-2222-222222222222';
delete from public.profiles where id = '22222222-2222-2222-2222-222222222222';

select '1. profile deleted' as check,
       (select count(*)::text from public.profiles where id='22222222-2222-2222-2222-222222222222') as value;
select '2. counterparty transaction SURVIVES' as check,
       (select count(*)::text from public.transactions where request_id = :'rid') as value;
select '3. borrower_id nulled, not orphaned' as check,
       (select (borrower_id is null)::text from public.transactions where request_id = :'rid') as value;
select '4. owner history intact' as check,
       (select (owner_id = '11111111-1111-1111-1111-111111111111')::text
          from public.transactions where request_id = :'rid') as value;
select '5. deleted user tools removed' as check,
       (select count(*)::text from public.tools where owner_id='22222222-2222-2222-2222-222222222222') as value;
