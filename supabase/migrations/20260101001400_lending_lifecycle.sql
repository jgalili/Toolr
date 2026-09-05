-- =====================================================================
-- NailedIt — the lending lifecycle
--
-- Accepting a request used to be the end of the story: a transaction row
-- appeared, and after that nothing in the app knew or cared whether the drill
-- had actually changed hands. The tool stayed in search the whole time, so a
-- second neighbour could ask to borrow something that was already in someone
-- else's garage, and the only way anyone could tell was to remember.
--
-- The rule this migration encodes is that nobody should have to remember:
--
--   accepted        -> RESERVED. The tool is spoken for on those dates and
--                      says so, but it is still in search and still borrowable,
--                      because a reservation for next Tuesday should not take
--                      a drill off the map for a week.
--   picked up       -> BORROWED. It is physically gone, so it leaves search.
--                      Either side can say it changed hands; one tap is enough.
--   borrower returns-> the loan is marked returned, but the tool stays out of
--                      search. The borrower saying "I gave it back" is a claim,
--                      not a fact.
--   owner confirms  -> and only now is the tool available again.
--
-- The last two lines are the whole reason the release is keyed on
-- owner_confirmed_return_at rather than on status: a borrower must never be
-- able to put someone else's tool back on the market.
-- =====================================================================

-- A pickup is its own kind of news, so it gets its own notification kind
-- rather than borrowing one that means something else. Added before any
-- function uses it: a new enum value cannot be used in the transaction that
-- created it, and every use below happens in a later statement.
alter type notification_kind add value if not exists 'tool_picked_up';

-- ---------------------------------------------------------------------
-- 1. The handover.
--
-- Either party may record it. The owner watches it go out of the door and the
-- borrower walks away holding it; both know, and making them agree on who taps
-- is friction for its own sake. Only from 'agreed', so it cannot walk a
-- finished loan backwards.
-- ---------------------------------------------------------------------
create or replace function public.confirm_pickup(p_transaction_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_tx    public.transactions;
  v_conv  uuid;
  v_tool  text;
  v_other uuid;
begin
  select * into v_tx from public.transactions where id = p_transaction_id;
  if v_tx.id is null then
    raise exception 'Transaction not found' using errcode = 'P0002';
  end if;
  if auth.uid() not in (v_tx.owner_id, v_tx.borrower_id) then
    raise exception 'Not your transaction' using errcode = '42501';
  end if;
  if v_tx.status = 'picked_up' then
    return;                                   -- idempotent: both sides may tap
  end if;
  if v_tx.status <> 'agreed' then
    raise exception 'That borrow is no longer waiting to be picked up'
      using errcode = '22023';
  end if;

  update public.transactions
     set status = 'picked_up', picked_up_at = coalesce(picked_up_at, now())
   where id = p_transaction_id;

  select title into v_tool from public.tools where id = v_tx.tool_id;
  select id into v_conv from public.conversations where request_id = v_tx.request_id;

  -- Say it in the thread. A state change that only exists on a status screen
  -- is a state change the other person will not see.
  if v_conv is not null then
    insert into public.messages (conversation_id, sender_id, kind, body)
    values (v_conv, auth.uid(), 'system',
            'Picked up. Due back ' ||
            to_char(v_tx.due_at at time zone 'Asia/Jerusalem', 'Dy DD Mon, HH24:MI') || '.');
  end if;

  v_other := case when auth.uid() = v_tx.owner_id then v_tx.borrower_id else v_tx.owner_id end;
  insert into public.notifications (user_id, kind, title, body, route, payload)
  values (v_other, 'tool_picked_up', 'Picked up', coalesce(v_tool, ''),
          'nailedit://transactions/' || v_tx.id,
          jsonb_build_object('transaction_id', v_tx.id, 'status', 'picked_up'));
end $$;

grant execute on function public.confirm_pickup(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 2. Availability follows the loan, automatically.
--
-- A trigger rather than a line inside each RPC: cancellation, a future dispute
-- flow, an admin fixing something by hand — every one of those has to leave the
-- listing in the right state, and the only way to guarantee that is to derive
-- it from the row instead of asking each caller to remember.
--
-- Both branches are guarded on the CURRENT listing status, so a tool the owner
-- deliberately paused or removed is never dragged back into search by a loan
-- ending.
-- ---------------------------------------------------------------------
create or replace function public.sync_tool_availability()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.owner_confirmed_return_at is not null
     or new.status in ('completed', 'cancelled') then
    -- The owner has it back (or the loan is off). Only ever un-borrows a tool
    -- that this loop itself marked borrowed.
    update public.tools set status = 'active', updated_at = now()
     where id = new.tool_id and status = 'borrowed';

  elsif new.status = 'picked_up' then
    update public.tools set status = 'borrowed', updated_at = now()
     where id = new.tool_id and status = 'active';
  end if;

  -- 'agreed' does nothing on purpose: a reservation is a promise about dates,
  -- not a tool leaving the neighbourhood. 'disputed' also does nothing, which
  -- keeps the listing out of search until a human resolves it.
  return new;
end $$;

drop trigger if exists trg_sync_tool_availability on public.transactions;
create trigger trg_sync_tool_availability
  after insert or update of status, owner_confirmed_return_at on public.transactions
  for each row execute function public.sync_tool_availability();

-- ---------------------------------------------------------------------
-- 3. Release the tool when the OWNER confirms, and not before.
--
-- confirm_return() already recorded each side's confirmation; what it did not
-- do is distinguish them. Re-stated here so the ordering is explicit and so the
-- owner's confirmation is the one that fires the trigger above.
-- ---------------------------------------------------------------------
create or replace function public.confirm_return(p_transaction_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_tx   public.transactions;
  v_conv uuid;
begin
  select * into v_tx from public.transactions where id = p_transaction_id;
  if v_tx.id is null then
    raise exception 'Transaction not found' using errcode = 'P0002';
  end if;
  if auth.uid() not in (v_tx.owner_id, v_tx.borrower_id) then
    raise exception 'Not your transaction' using errcode = '42501';
  end if;
  if v_tx.status not in ('agreed', 'picked_up', 'returned') then
    raise exception 'That borrow is already finished' using errcode = '22023';
  end if;

  if auth.uid() = v_tx.owner_id then
    update public.transactions set owner_confirmed_return_at = now()
     where id = p_transaction_id;
  else
    update public.transactions set borrower_confirmed_return_at = now()
     where id = p_transaction_id;
  end if;

  update public.transactions
     set status = 'returned', returned_at = coalesce(returned_at, now())
   where id = p_transaction_id and status in ('agreed', 'picked_up');

  update public.transactions t
     set status = 'completed', completed_at = now()
   where t.id = p_transaction_id
     and t.owner_confirmed_return_at is not null
     and t.borrower_confirmed_return_at is not null;

  select id into v_conv from public.conversations where request_id = v_tx.request_id;
  if v_conv is not null then
    insert into public.messages (conversation_id, sender_id, kind, body)
    values (v_conv, auth.uid(), 'system',
            case when auth.uid() = v_tx.owner_id
                 then 'Confirmed returned. Thanks!'
                 else 'Marked as returned.' end);
  end if;

  update public.profiles p
     set completed_lends = completed_lends + 1
   where p.id = v_tx.owner_id
     and exists (select 1 from public.transactions x
                  where x.id = p_transaction_id and x.status = 'completed');

  update public.profiles p
     set completed_borrows = completed_borrows + 1
   where p.id = v_tx.borrower_id
     and exists (select 1 from public.transactions x
                  where x.id = p_transaction_id and x.status = 'completed');
end $$;

grant execute on function public.confirm_return(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 4. Reserved dates are public; who reserved them is not.
--
-- A tool that is spoken for next Tuesday should say so on its card, otherwise
-- someone asks for Tuesday and gets a decline they could have been spared. But
-- that is a fact about DATES. The borrower's identity, the message they sent
-- and the pickup address stay behind the existing policies -- this returns four
-- columns and none of them is a person.
--
-- Takes an array so a screenful of cards is one round trip rather than twenty.
-- ---------------------------------------------------------------------
create or replace function public.reserved_windows(p_tool_ids uuid[])
returns table (tool_id uuid, start_at timestamptz, end_at timestamptz, is_out boolean)
language sql stable security definer set search_path = public as $$
  select tx.tool_id,
         br.start_at,
         tx.due_at,
         tx.status = 'picked_up'
    from public.transactions tx
    join public.borrow_requests br on br.id = tx.request_id
   where tx.tool_id = any(p_tool_ids)
     and tx.status in ('agreed', 'picked_up')
     and tx.owner_confirmed_return_at is null
     and tx.due_at > now() - interval '30 days'
   order by br.start_at;
$$;

grant execute on function public.reserved_windows(uuid[]) to anon, authenticated;

-- ---------------------------------------------------------------------
-- 5. Close the door the app was walking through.
--
-- `confirm_pickup` used to be a plain UPDATE from the client, which worked
-- because tx_update let either party write any column of a transaction. That
-- also let a borrower set status = 'completed', move due_at, or -- now that a
-- tool's availability follows its loan -- put someone else's drill back into
-- search without the owner agreeing. Every legitimate write goes through a
-- SECURITY DEFINER function above, so the policy has no remaining job.
-- ---------------------------------------------------------------------
drop policy if exists tx_update on public.transactions;
