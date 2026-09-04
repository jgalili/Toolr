-- =====================================================================
-- NailedIt — let the owner say "yes, but Thursday"
--
-- respond_to_request() took a yes or a no and nothing else, so the borrower's
-- proposed window was the only window on offer. In practice that is not how
-- lending a drill goes: the answer is usually "sure, but I need it back by
-- Thursday evening". With no way to express that, an owner's only options
-- were to accept a date that does not suit them or to decline someone they
-- were happy to lend to.
--
-- This adds an optional new return time. Everything else — the transaction,
-- the conversation, the notification — is unchanged, and a null keeps the
-- old behaviour exactly, so existing callers are unaffected.
-- =====================================================================

-- `create or replace` only replaces a function with the SAME argument list.
-- Adding a parameter — even a defaulted one — creates a second function beside
-- the first, and then a two-argument call matches both: the old one exactly,
-- and the new one via its default. PostgreSQL refuses to guess and every
-- existing caller breaks with "function ... is not unique". Explicit casts do
-- not help, because the ambiguity is the arity, not the types.
--
-- So the old signature has to go before the new one takes its place.
drop function if exists public.respond_to_request(uuid, request_status);

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

  -- The owner may move the return, but not to before the pickup, and not into
  -- the past. Anything else is validated the same as the original window.
  v_due := coalesce(p_due_at, v_req.end_at);
  if v_due <= v_req.start_at then
    raise exception 'The return has to be after the pickup' using errcode = '22023';
  end if;
  if v_due < now() - interval '1 hour' then
    raise exception 'That return time has already passed' using errcode = '22023';
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

    -- If the owner moved the date, say so in the thread. A changed return time
    -- that only appears on a status screen is a change the borrower will miss.
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
