-- =====================================================================
-- NailedIt — pickup windows and "what's included", as structured rows
--
-- Both of these previously lived in free text on `tools`:
--   * `availability_mode` said "now / dates / ask" but never *when*, so a
--     borrower had to message to find out whether 19:00 was any use;
--   * `accessories` was a comma-joined string, which cannot be rendered as
--     three labelled items and cannot be searched.
--
-- `tools.accessories` is deliberately NOT dropped. Listings created before
-- this migration keep it, and the detail screen falls back to it, so nothing
-- silently loses its contents.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Recurring weekly pickup windows.
--
-- Weekly rather than a list of dates because that is how lending actually
-- works: "evenings after work" is a habit. weekday is 0 = Sunday, matching
-- Postgres extract(dow …) and the Israeli week.
-- ---------------------------------------------------------------------
create table if not exists public.tool_pickup_windows (
  id          uuid primary key default gen_random_uuid(),
  tool_id     uuid not null references public.tools(id) on delete cascade,
  weekday     smallint not null check (weekday between 0 and 6),
  start_time  time not null,
  end_time    time not null,
  created_at  timestamptz not null default now(),
  constraint pickup_window_ordered check (end_time > start_time),
  unique (tool_id, weekday, start_time, end_time)
);

create index if not exists tool_pickup_windows_idx
  on public.tool_pickup_windows (tool_id, weekday, start_time);

-- ---------------------------------------------------------------------
-- What is in the box.
--
-- `icon` is a closed set rather than free text: the app maps it to a drawn
-- glyph, and an unknown value would render as a blank square. Anything that
-- isn't a battery, a charger or a case is just 'item'.
-- ---------------------------------------------------------------------
create table if not exists public.tool_included_items (
  id        uuid primary key default gen_random_uuid(),
  tool_id   uuid not null references public.tools(id) on delete cascade,
  label     text not null check (char_length(label) between 1 and 40),
  icon      text not null default 'item'
            check (icon in ('battery', 'charger', 'case', 'item')),
  position  smallint not null default 0
);

create index if not exists tool_included_items_idx
  on public.tool_included_items (tool_id, position);

-- ---------------------------------------------------------------------
-- RLS. Both tables are as public as the listing they belong to, and
-- writable only by its owner — the same rule tool_photos uses.
-- ---------------------------------------------------------------------
alter table public.tool_pickup_windows enable row level security;
alter table public.tool_included_items enable row level security;

drop policy if exists tool_pickup_windows_read on public.tool_pickup_windows;
create policy tool_pickup_windows_read on public.tool_pickup_windows for select
  using (exists (select 1 from public.tools t
                 where t.id = tool_id and (t.status = 'active' or t.owner_id = auth.uid())));

drop policy if exists tool_pickup_windows_write on public.tool_pickup_windows;
create policy tool_pickup_windows_write on public.tool_pickup_windows for all
  using (exists (select 1 from public.tools t where t.id = tool_id and t.owner_id = auth.uid()))
  with check (exists (select 1 from public.tools t where t.id = tool_id and t.owner_id = auth.uid()));

drop policy if exists tool_included_items_read on public.tool_included_items;
create policy tool_included_items_read on public.tool_included_items for select
  using (exists (select 1 from public.tools t
                 where t.id = tool_id and (t.status = 'active' or t.owner_id = auth.uid())));

drop policy if exists tool_included_items_write on public.tool_included_items;
create policy tool_included_items_write on public.tool_included_items for all
  using (exists (select 1 from public.tools t where t.id = tool_id and t.owner_id = auth.uid()))
  with check (exists (select 1 from public.tools t where t.id = tool_id and t.owner_id = auth.uid()));

-- ---------------------------------------------------------------------
-- Owner-side writes.
--
-- Replace-the-whole-set rather than add/remove one at a time: the listing
-- editor shows all the windows at once, so a partial update has no meaning
-- and a delete+insert in one transaction cannot leave a half-saved state.
-- ---------------------------------------------------------------------
create or replace function public.set_pickup_windows(
  p_tool_id uuid,
  p_windows jsonb            -- [{"weekday":0,"start":"18:00","end":"20:00"}, …]
)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_owner uuid;
begin
  select owner_id into v_owner from public.tools where id = p_tool_id;
  if v_owner is null or v_owner <> auth.uid() then
    raise exception 'not_your_tool' using errcode = '42501';
  end if;

  delete from public.tool_pickup_windows where tool_id = p_tool_id;

  insert into public.tool_pickup_windows (tool_id, weekday, start_time, end_time)
  select p_tool_id,
         (w ->> 'weekday')::smallint,
         (w ->> 'start')::time,
         (w ->> 'end')::time
  from jsonb_array_elements(coalesce(p_windows, '[]'::jsonb)) as w
  on conflict do nothing;
end $$;

create or replace function public.set_included_items(
  p_tool_id uuid,
  p_items jsonb              -- [{"label":"18V Battery","icon":"battery"}, …]
)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_owner uuid;
begin
  select owner_id into v_owner from public.tools where id = p_tool_id;
  if v_owner is null or v_owner <> auth.uid() then
    raise exception 'not_your_tool' using errcode = '42501';
  end if;

  delete from public.tool_included_items where tool_id = p_tool_id;

  insert into public.tool_included_items (tool_id, label, icon, position)
  select p_tool_id,
         left(i ->> 'label', 40),
         coalesce(nullif(i ->> 'icon', ''), 'item'),
         (ord - 1)::smallint
  from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) with ordinality as e(i, ord)
  -- Three fit on the detail screen; more would scroll off and confuse.
  where ord <= 3
    and coalesce(nullif(i ->> 'icon', ''), 'item') in ('battery', 'charger', 'case', 'item');
end $$;

grant execute on function public.set_pickup_windows(uuid, jsonb) to authenticated;
grant execute on function public.set_included_items(uuid, jsonb) to authenticated;
