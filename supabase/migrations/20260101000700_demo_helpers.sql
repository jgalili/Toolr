-- =====================================================================
-- NailedIt — "make the demo mine"
--
-- The seed creates a conversation between two demo neighbours. RLS means
-- nobody else can see it, so a real person who signs in to try the app
-- lands on an empty Messages tab and an empty Borrowing list — which is
-- the truth, and also a terrible demo.
--
-- This gives the *caller* their own copy: an accepted borrow of Daniel's
-- drill, with the same short thread. It is a demo affordance, not a
-- product feature, and it is deliberately conservative:
--   * it does nothing unless the demo seed is present;
--   * it does nothing if the caller already has a transaction, so it can
--     never trample real activity;
--   * it refuses guests, exactly like every other write.
-- Drop this migration before a public launch.
-- =====================================================================

create or replace function public.seed_demo_for_me()
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_user   uuid := auth.uid();
  v_owner  uuid := '00000000-0000-4000-a000-000000000001';   -- Daniel, from the seed
  v_drill  uuid;
  v_req    uuid;
  v_conv   uuid;
begin
  if not public.is_member() then
    raise exception 'Sign in first' using errcode = '42501';
  end if;

  select id into v_drill from public.tools
   where owner_id = v_owner and title = 'Bosch Cordless Drill' and status = 'active'
   limit 1;

  if v_drill is null then
    return jsonb_build_object('ok', false, 'reason', 'no_demo_data');
  end if;

  if v_user = v_owner then
    return jsonb_build_object('ok', false, 'reason', 'you_are_the_owner');
  end if;

  if exists (select 1 from public.transactions
              where borrower_id = v_user or owner_id = v_user) then
    return jsonb_build_object('ok', false, 'reason', 'already_has_activity');
  end if;

  -- The same rows respond_to_request would have written, in the same order.
  insert into public.borrow_requests (
    tool_id, borrower_id, owner_id, start_at, end_at, message,
    quoted_total_agorot, payment_mode, risk_acknowledged, status, responded_at
  ) values (
    v_drill, v_user, v_owner,
    date_trunc('day', now()) + interval '18 hours 30 minutes',
    date_trunc('day', now()) + interval '1 day 21 hours',
    'Hi Daniel, can I borrow the drill today around 18:30?',
    null, 'free', true, 'accepted', now()
  ) returning id into v_req;

  insert into public.transactions (
    request_id, tool_id, owner_id, borrower_id, status,
    agreed_total_agorot, payment_mode, payment_status, due_at
  ) values (
    v_req, v_drill, v_owner, v_user, 'agreed',
    null, 'free', 'not_applicable'::payment_status,
    date_trunc('day', now()) + interval '1 day 21 hours'
  );

  insert into public.conversations (tool_id, request_id, owner_id, borrower_id, last_message_at)
  values (v_drill, v_req, v_owner, v_user, now())
  returning id into v_conv;

  insert into public.messages (conversation_id, sender_id, kind, body, created_at) values
    (v_conv, v_user,  'text', 'Hi Daniel, can I borrow the drill today around 18:30?', now() - interval '24 minutes'),
    (v_conv, v_owner, 'text', 'Yes — no problem. I''ll be home after 18:00.',          now() - interval '22 minutes'),
    (v_conv, v_user,  'text', 'Perfect, thanks!',                                      now() - interval '21 minutes'),
    (v_conv, v_owner, 'text', 'Pickup near Dizengoff Center.',                         now() - interval '12 minutes');

  return jsonb_build_object('ok', true, 'conversation_id', v_conv);
end $$;

grant execute on function public.seed_demo_for_me() to authenticated;
