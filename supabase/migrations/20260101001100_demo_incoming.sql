-- =====================================================================
-- NailedIt — let a demo neighbour ask to borrow YOUR tool
--
-- The lending half of the app is unreachable in a solo demo. You can list a
-- tool, but nobody is going to ask for it, so Accept, "picked up", "returned"
-- and rating-the-borrower never appear — the whole owner side of the product
-- is invisible to the person you are showing it to.
--
-- This has one of the seeded neighbours send a real borrow request for a tool
-- the caller owns, through the same table and the same shape as a genuine one.
-- From there everything is the real flow: the request lands in the Inbox, the
-- caller accepts it, a conversation and transaction are created by
-- respond_to_request, reminders get scheduled, and both sides can rate.
--
-- Demo affordance. Drop before a public launch.
-- =====================================================================

create or replace function public.demo_borrow_my_tool(p_tool_id uuid default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_user     uuid := auth.uid();
  -- Yael, from the seed. A different person from the one who lends the drill,
  -- so a demo showing both directions does not look like one pen pal.
  v_neighbour uuid := '00000000-0000-4000-a000-000000000002';
  v_tool      public.tools;
  v_days      integer := 2;
  v_start     timestamptz := date_trunc('hour', now()) + interval '3 hours';
  v_req       public.borrow_requests;
begin
  if not public.is_member() then
    raise exception 'Sign in first' using errcode = '42501';
  end if;

  if not exists (select 1 from public.profiles where id = v_neighbour) then
    return jsonb_build_object('ok', false, 'reason', 'no_demo_data');
  end if;

  select * into v_tool
    from public.tools
   where owner_id = v_user
     and status = 'active'
     and deleted_at is null
     and (p_tool_id is null or id = p_tool_id)
   order by created_at desc
   limit 1;

  if v_tool.id is null then
    return jsonb_build_object('ok', false, 'reason', 'no_tool_of_yours');
  end if;

  if exists (
    select 1 from public.borrow_requests
     where tool_id = v_tool.id and borrower_id = v_neighbour and status = 'pending'
  ) then
    return jsonb_build_object('ok', false, 'reason', 'already_asked', 'tool', v_tool.title);
  end if;

  -- Same columns create_borrow_request writes, including the server-side quote,
  -- so accepting it exercises the real code path rather than a special case.
  insert into public.borrow_requests (
    tool_id, borrower_id, owner_id, start_at, end_at, message,
    quoted_total_agorot, payment_mode, risk_acknowledged
  ) values (
    v_tool.id, v_neighbour, v_user,
    v_start, v_start + (v_days || ' days')::interval,
    'Hi! Saw your ' || v_tool.title || ' — could I borrow it for a couple of days?',
    case when v_tool.payment_mode = 'free' then null
         else coalesce(v_tool.price_per_day_agorot, 0) * v_days end,
    v_tool.payment_mode, true
  ) returning * into v_req;

  insert into public.notifications (user_id, kind, title, body, route, payload)
  values (
    v_user, 'borrow_request_received',
    'New borrow request', v_tool.title,
    'nailedit://requests/' || v_req.id,
    jsonb_build_object('request_id', v_req.id, 'tool_id', v_tool.id)
  );

  return jsonb_build_object(
    'ok', true, 'request_id', v_req.id, 'tool', v_tool.title
  );
end $$;

grant execute on function public.demo_borrow_my_tool(uuid) to authenticated;
