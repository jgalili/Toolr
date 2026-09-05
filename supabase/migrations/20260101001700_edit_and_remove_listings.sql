-- =====================================================================
-- NailedIt — a listing you can change your mind about
--
-- Reported plainly: "when I publish an item I can't change the details after
-- I publish (for example - cost, availability etc...) and I can't delete
-- items". Both were true. create_tool_with_location() was the only write
-- path, and the only thing that could be changed afterwards was the on/off
-- switch in setToolStatus.
--
-- That is a real problem rather than a missing nicety. A price typed wrong is
-- permanent; a tool you sold is advertised forever; and the workaround people
-- reach for — publish a second, corrected copy — quietly fills the
-- neighbourhood with duplicates.
--
-- Two functions here, deliberately separate from the create path:
--
--   update_tool()  — every editable field, each one optional, with the
--                    price/free rule enforced the same way it is on create.
--   remove_tool()  — a soft delete, refused while the tool is in someone
--                    else's hands.
-- =====================================================================

-- ---------------------------------------------------------------------
-- update_tool
--
-- Every parameter defaults to null and null means "leave it alone", so a
-- client may send only the field it changed. The two places where null is a
-- meaningful VALUE rather than "unchanged" — clearing a description, taking
-- the ceiling off max_borrow_days — get explicit p_clear_* flags, because
-- guessing between them is how an edit screen silently wipes a field the
-- person never touched.
-- ---------------------------------------------------------------------
create or replace function public.update_tool(
  p_tool_id              uuid,
  p_title                text default null,
  p_description          text default null,
  p_condition            text default null,
  p_accessories          text default null,
  p_instructions         text default null,
  p_max_borrow_days      smallint default null,
  p_is_free              boolean default null,
  p_price_per_day_agorot bigint default null,
  p_availability_mode    availability_mode default null,
  p_category_slug        text default null,
  p_address_line         text default null,
  p_pickup_notes         text default null,
  p_lat                  double precision default null,
  p_lng                  double precision default null,
  p_clear_description    boolean default false,
  p_clear_accessories    boolean default false,
  p_clear_instructions   boolean default false,
  p_clear_max_days       boolean default false
)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_tool     public.tools;
  v_category smallint;
  v_free     boolean;
  v_price    bigint;
  v_exact    geography(Point, 4326);
begin
  select * into v_tool from public.tools where id = p_tool_id and deleted_at is null;
  if v_tool.id is null then
    raise exception 'That tool is not available' using errcode = 'P0002';
  end if;
  if v_tool.owner_id <> auth.uid() then
    raise exception 'not_your_tool' using errcode = '42501';
  end if;

  -- Resolve the pricing pair TOGETHER. Changing only one of them is how a
  -- listing ends up marked free with a price attached, or marked paid with
  -- none — and the second of those is what create already refuses.
  v_free  := coalesce(p_is_free, v_tool.payment_mode = 'free');
  v_price := coalesce(p_price_per_day_agorot, v_tool.price_per_day_agorot);
  if not v_free and coalesce(v_price, 0) <= 0 then
    raise exception 'A rental needs a price per day' using errcode = '22023';
  end if;

  if p_category_slug is not null then
    select id into v_category from public.tool_categories where slug = p_category_slug;
  end if;

  update public.tools set
    title               = coalesce(p_title, title),
    description         = case when p_clear_description then null
                               else coalesce(p_description, description) end,
    condition           = coalesce(p_condition, condition),
    accessories         = case when p_clear_accessories then null
                               else coalesce(p_accessories, accessories) end,
    instructions        = case when p_clear_instructions then null
                               else coalesce(p_instructions, instructions) end,
    max_borrow_days     = case when p_clear_max_days then null
                               else coalesce(p_max_borrow_days, max_borrow_days) end,
    payment_mode        = case when v_free then 'free' else 'offline' end::payment_mode,
    price_per_day_agorot = case when v_free then null else v_price end,
    availability_mode   = coalesce(p_availability_mode, availability_mode),
    category_id         = coalesce(v_category, category_id),
    updated_at          = now()
  where id = p_tool_id;

  -- Moving the tool re-fuzzes the public point from the new exact one, using
  -- the same offset function as create. Never write the exact point to
  -- public.tools, not even for a moment.
  if p_lat is not null and p_lng is not null then
    v_exact := ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography;
    update public.tools set fuzzed_location = public.fuzz_point(v_exact, p_tool_id)
     where id = p_tool_id;
    insert into public.tool_locations (tool_id, exact_location, address_line, pickup_notes)
    values (p_tool_id, v_exact, p_address_line, p_pickup_notes)
    on conflict (tool_id) do update
      set exact_location = excluded.exact_location,
          address_line   = coalesce(excluded.address_line, public.tool_locations.address_line),
          pickup_notes   = coalesce(excluded.pickup_notes, public.tool_locations.pickup_notes);
  elsif p_address_line is not null or p_pickup_notes is not null then
    update public.tool_locations set
      address_line = coalesce(p_address_line, address_line),
      pickup_notes = coalesce(p_pickup_notes, pickup_notes)
    where tool_id = p_tool_id;
  end if;
end $$;

grant execute on function public.update_tool(
  uuid, text, text, text, text, text, smallint, boolean, bigint, availability_mode,
  text, text, text, double precision, double precision, boolean, boolean, boolean, boolean
) to authenticated;

-- ---------------------------------------------------------------------
-- remove_tool
--
-- A SOFT delete. The row stays, so a completed loan keeps its title and the
-- other person's history does not develop a hole where a tool used to be —
-- the same reason the deletion-retention rules exist elsewhere in this schema.
--
-- Refused while the tool is out. Deleting a listing does not get you your
-- ladder back, and letting the record vanish mid-loan takes the return
-- controls with it.
-- ---------------------------------------------------------------------
create or replace function public.remove_tool(p_tool_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_owner uuid;
  v_live  integer;
begin
  select owner_id into v_owner from public.tools where id = p_tool_id and deleted_at is null;
  if v_owner is null then
    raise exception 'That tool is not available' using errcode = 'P0002';
  end if;
  if v_owner <> auth.uid() then
    raise exception 'not_your_tool' using errcode = '42501';
  end if;

  select count(*) into v_live from public.transactions
   where tool_id = p_tool_id and status in ('agreed', 'picked_up', 'returned');
  if v_live > 0 then
    raise exception 'That tool is out on loan right now' using errcode = '22023';
  end if;

  -- Any pending request for it is answered by the removal itself. Leaving
  -- them pending would leave people waiting for a reply that cannot come.
  update public.borrow_requests
     set status = 'cancelled', responded_at = now()
   where tool_id = p_tool_id and status = 'pending';

  update public.tools
     set deleted_at = now(), status = 'removed', updated_at = now()
   where id = p_tool_id;
end $$;

grant execute on function public.remove_tool(uuid) to authenticated;

-- The public read policy already required `deleted_at is null`; the owner's
-- own policy did not, so a removed listing still appeared in My Tools.
drop policy if exists tools_read_own on public.tools;
create policy tools_read_own on public.tools for select
  using (owner_id = auth.uid() and deleted_at is null);
