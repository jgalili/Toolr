-- =====================================================================
-- NailedIt — let the demo neighbours answer
--
-- Borrow requests only become conversations when the OWNER accepts them.
-- That is right for the product and useless for a demo: the seeded owners
-- are fictional, so a request sent to Daniel or Yael stays pending forever
-- and the Messages tab stays empty. Someone showing the app to a potential
-- user taps Borrow, writes a message, and then has nothing to show.
--
-- This answers on their behalf — but only for requests the CALLER sent to a
-- SEEDED owner. It cannot touch a request between two real people, and it
-- cannot answer a request that isn't yours.
--
-- Demo affordance, like seed_demo_for_me(). Drop before a public launch.
-- =====================================================================

create or replace function public.demo_answer_my_requests()
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_demo_owners uuid[] := array[
    '00000000-0000-4000-a000-000000000001',
    '00000000-0000-4000-a000-000000000002',
    '00000000-0000-4000-a000-000000000003',
    '00000000-0000-4000-a000-000000000004',
    '00000000-0000-4000-a000-000000000005',
    '00000000-0000-4000-a000-000000000006'
  ]::uuid[];
  v_user     uuid := auth.uid();
  v_req      public.borrow_requests;
  v_conv     uuid;
  v_tool     text;
  v_answered integer := 0;
begin
  if not public.is_member() then
    raise exception 'Sign in first' using errcode = '42501';
  end if;

  for v_req in
    select * from public.borrow_requests
     where borrower_id = v_user
       and owner_id = any(v_demo_owners)
       and status = 'pending'
     order by created_at
  loop
    -- Exactly what respond_to_request(accepted) writes, in the same order.
    update public.borrow_requests
       set status = 'accepted', responded_at = now()
     where id = v_req.id;

    select title into v_tool from public.tools where id = v_req.tool_id;

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

    -- The borrower's own message first, so the thread reads as a conversation
    -- rather than starting with the owner talking to nobody.
    if coalesce(btrim(v_req.message), '') <> '' then
      insert into public.messages (conversation_id, sender_id, kind, body, created_at)
      values (v_conv, v_req.borrower_id, 'text', v_req.message, v_req.created_at);
    end if;

    insert into public.messages (conversation_id, sender_id, kind, body, created_at)
    values (v_conv, v_req.owner_id, 'system',
            'Request accepted. Pickup details are now shared.', now() - interval '2 minutes');

    insert into public.messages (conversation_id, sender_id, kind, body, created_at)
    values (v_conv, v_req.owner_id, 'text',
            'Sure — I''m around this evening. Message me when you set off.', now() - interval '1 minute');

    insert into public.notifications (user_id, kind, title, body, route, payload)
    values (
      v_req.borrower_id, 'borrow_request_accepted',
      'Request accepted', coalesce(v_tool, ''),
      'nailedit://requests/' || v_req.id,
      jsonb_build_object('request_id', v_req.id)
    );

    v_answered := v_answered + 1;
  end loop;

  return jsonb_build_object('ok', true, 'answered', v_answered);
end $$;

grant execute on function public.demo_answer_my_requests() to authenticated;
