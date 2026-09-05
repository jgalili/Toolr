-- =====================================================================
-- NailedIt — the person holding the drill can still see the drill
--
-- A regression introduced by the lending lifecycle, and a good example of two
-- correct rules combining into a wrong one.
--
--   sync_tool_availability()  sets tools.status = 'borrowed' at pickup, so the
--                             listing leaves search while it is out. Right.
--   tools_read_active         lets anyone read a listing where status =
--                             'active'. Right, when 'borrowed' did not exist.
--
-- Together: the moment a loan starts, the only person who can still read the
-- row is the owner (via tools_read_own). The borrower — who is holding the
-- thing — gets an empty embed, so their "Borrowing" card renders with no
-- title and no photo, and the return controls hang off a nameless card. The
-- same applied to tool_photos_read, which tests the same status.
--
-- The fix is a third read path: the two people in a transaction can read that
-- transaction's tool, whatever its status. Note what this does NOT touch —
-- tool_locations stays owner-only, and exact coordinates are still reachable
-- only through get_pickup_location(), which re-checks the transaction state.
-- A listing's title and photo were always public; its address never was.
-- =====================================================================

-- SECURITY DEFINER so the check itself is not subject to RLS on transactions,
-- which would make the policy depend on a policy. STABLE so the planner may
-- evaluate it once per statement rather than once per row.
create or replace function public.is_transaction_party(p_tool_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
      from public.transactions t
     where t.tool_id = p_tool_id
       and auth.uid() in (t.owner_id, t.borrower_id)
  )
  or exists (
    -- Also while a request is merely pending: having asked about a tool is
    -- enough to keep seeing it if the owner pauses the listing meanwhile.
    select 1
      from public.borrow_requests r
     where r.tool_id = p_tool_id
       and auth.uid() in (r.owner_id, r.borrower_id)
  );
$$;

revoke execute on function public.is_transaction_party(uuid) from public;
grant execute on function public.is_transaction_party(uuid) to authenticated;

drop policy if exists tools_read_counterparty on public.tools;
create policy tools_read_counterparty on public.tools for select
  using (public.is_transaction_party(id));

drop policy if exists tool_photos_read_counterparty on public.tool_photos;
create policy tool_photos_read_counterparty on public.tool_photos for select
  using (public.is_transaction_party(tool_id));
