-- =====================================================================
-- NailedIt — move the demo neighbourhood to wherever you are
--
-- The seed puts fourteen listings around Florentin, Tel Aviv. That is
-- useless to anyone demonstrating the app from anywhere else: the search
-- looks within a few kilometres of the *viewer*, finds nothing, and the
-- app looks broken when it is working perfectly.
--
-- This translates every seeded listing by one vector — the difference
-- between their current centroid and the point you give it — so the
-- neighbourhood keeps its exact shape. The drill stays ~300 m from the
-- centre, the ladder stays ~700 m, their bearings from each other are
-- unchanged. Only where "here" is moves.
--
-- It writes to tool_locations, so the fuzzing trigger recomputes every
-- public pin. The exact points never touch the public table.
--
-- Demo affordance, like seed_demo_for_me(). Drop before a public launch.
-- =====================================================================

create or replace function public.move_demo_tools_here(
  p_lat double precision,
  p_lng double precision
)
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
  v_lat0  double precision;
  v_lng0  double precision;
  v_moved integer;
begin
  if not public.is_member() then
    raise exception 'Sign in first' using errcode = '42501';
  end if;

  if p_lat is null or p_lng is null
     or p_lat not between -90 and 90 or p_lng not between -180 and 180 then
    raise exception 'Bad coordinates' using errcode = '22023';
  end if;

  -- Where the demo neighbourhood currently sits.
  select avg(ST_Y(tl.exact_location::geometry)), avg(ST_X(tl.exact_location::geometry))
    into v_lat0, v_lng0
    from public.tool_locations tl
    join public.tools t on t.id = tl.tool_id
   where t.owner_id = any(v_demo_owners);

  if v_lat0 is null then
    return jsonb_build_object('ok', false, 'reason', 'no_demo_data');
  end if;

  -- One translation for all of them, so the layout survives intact.
  update public.tool_locations tl
     set exact_location = ST_SetSRID(
           ST_MakePoint(
             ST_X(tl.exact_location::geometry) + (p_lng - v_lng0),
             ST_Y(tl.exact_location::geometry) + (p_lat - v_lat0)
           ), 4326)::geography,
         updated_at = now()
    from public.tools t
   where t.id = tl.tool_id
     and t.owner_id = any(v_demo_owners);

  get diagnostics v_moved = row_count;

  return jsonb_build_object('ok', true, 'moved', v_moved);
end $$;

grant execute on function public.move_demo_tools_here(double precision, double precision)
  to authenticated;
