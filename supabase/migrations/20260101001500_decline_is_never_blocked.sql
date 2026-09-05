-- =====================================================================
-- NailedIt — a decline is an answer, not a booking
--
-- Reported as "when I click accept or decline for someone's 'wants to
-- borrow' message, nothing happens". Nothing was the button's fault. The
-- server was answering, precisely and correctly:
--
--   400  22023  "That return time has already passed"
--
-- Two separate faults produced "nothing happens" from that:
--
--  1. The app never rendered a failed mutation, so a considered refusal was
--     indistinguishable from a dead control. Fixed in the client, once, for
--     every mutation (see app/_layout.tsx).
--
--  2. This function validated the return window BEFORE it looked at the
--     decision. So a request whose window had already gone by could not even
--     be DECLINED — the one answer that is always available in real life, and
--     the only one that gets a stale request out of an owner's inbox. An
--     owner with a day-old request was stuck with it permanently.
--
-- The window only has to make sense if you are agreeing to it. Declining, and
-- letting a request lapse, are answers about the request, not the calendar.
-- So the checks move inside the accept branch, and the hint tells the client
-- which control fixes it.
-- =====================================================================

create or replace function public.respond_to_request(
  p_request_id uuid,
  p_decision   request_status,
  p_due_at     timestamptz default null
)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_req  public.borrow_requests;
  v_conv uuid;
  v_tool text;
  v_due  timestamptz;
begin
  select * into v_req from public.borrow_requests where id = p_request_id;
  if v_req.id is null then
    raise exception 'Request not found' using errcode = 'P0002';
  end if;
  if v_req.owner_id <> auth.uid() then
    raise exception 'Only the owner can answer this request' using errcode = '42501';
  end if;
  if v_req.status <> 'pending' then
    raise exception 'That request has already been answered' using errcode = '22023';
  end if;
  if p_decision not in ('accepted', 'declined') then
    raise exception 'Invalid decision' using errcode = '22023';
  end if;

  v_due := coalesce(p_due_at, v_req.end_at);

  -- Only an ACCEPT commits anyone to a date, so only an accept is judged on one.
  if p_decision = 'accepted' then
    if v_due <= v_req.start_at then
      raise exception 'The return has to be after the pickup'
        using errcode = '22023', hint = 'adjust_return';
    end if;
    -- An hour of slack: a request made for "back by 6" should still be
    -- acceptable at 6:20 without making the owner re-pick a time.
    if v_due < now() - interval '1 hour' then
      raise exception 'That return time has already passed'
        using errcode = '22023', hint = 'adjust_return';
    end if;
  end if;

  update public.borrow_requests
     set status = p_decision,
         responded_at = now(),
         end_at = case when p_decision = 'accepted' then v_due else end_at end
   where id = p_request_id;

  select title into v_tool from public.tools where id = v_req.tool_id;

  if p_decision = 'accepted' then
    insert into public.transactions (
      request_id, tool_id, owner_id, borrower_id, status,
      agreed_total_agorot, payment_mode, payment_status, payment_provider, due_at
    ) values (
      v_req.id, v_req.tool_id, v_req.owner_id, v_req.borrower_id, 'agreed',
      v_req.quoted_total_agorot, v_req.payment_mode,
      (case when v_req.payment_mode = 'free' then 'not_applicable' else 'pending' end)::payment_status,
      case when v_req.payment_mode = 'free' then null else 'offline' end,
      v_due
    );

    insert into public.conversations (tool_id, request_id, owner_id, borrower_id, last_message_at)
    values (v_req.tool_id, v_req.id, v_req.owner_id, v_req.borrower_id, now())
    returning id into v_conv;

    insert into public.messages (conversation_id, sender_id, kind, body)
    values (v_conv, v_req.owner_id, 'system', 'Request accepted. Pickup details are now shared.');

    if p_due_at is not null and p_due_at <> v_req.end_at then
      insert into public.messages (conversation_id, sender_id, kind, body)
      values (
        v_conv, v_req.owner_id, 'system',
        'Return time set to ' || to_char(v_due at time zone 'Asia/Jerusalem', 'Dy DD Mon, HH24:MI')
      );
    end if;
  end if;

  insert into public.notifications (user_id, kind, title, body, route, payload)
  values (
    v_req.borrower_id,
    (case when p_decision = 'accepted' then 'borrow_request_accepted'
          else 'borrow_request_declined' end)::notification_kind,
    case when p_decision = 'accepted' then 'Request accepted' else 'Request declined' end,
    coalesce(v_tool, ''),
    'nailedit://requests/' || v_req.id,
    jsonb_build_object('request_id', v_req.id, 'due_at', v_due)
  );
end $$;

grant execute on function public.respond_to_request(uuid, request_status, timestamptz)
  to authenticated;
