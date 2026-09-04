-- =====================================================================
-- NailedIt — keep a profile's name and picture in step with the identity
-- it signed in with
--
-- provision_member() already reads `full_name` and `avatar_url` out of the
-- auth metadata, but it has two gaps that show up the moment someone signs
-- in with Google:
--
--   1. Google does not always spell it `avatar_url`. Depending on the flow
--      the picture arrives as `picture`, and the name as `name` rather than
--      `full_name`. Reading only one spelling silently produces a profile
--      called "Neighbour" with no photo.
--
--   2. It is `on conflict do nothing`. Anyone who was a guest first — which
--      is everyone, since the app opens as a guest — already has a profile
--      row by the time they connect Google, so the good values are thrown
--      away.
--
-- So: widen the key lookup, and add a function the app calls after sign-in
-- that backfills only the fields that are still empty or still the
-- placeholder. It never overwrites a name or picture a person chose.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Where the identity providers actually put things.
-- ---------------------------------------------------------------------
create or replace function public.identity_display_name(p_meta jsonb)
returns text language sql immutable as $$
  select nullif(
    split_part(
      btrim(coalesce(
        nullif(p_meta ->> 'full_name', ''),
        nullif(p_meta ->> 'name', ''),
        nullif(p_meta ->> 'first_name', ''),
        nullif(p_meta ->> 'given_name', ''),
        ''
      )),
      ' ', 1),
    '');
$$;

create or replace function public.identity_avatar_url(p_meta jsonb)
returns text language sql immutable as $$
  select nullif(coalesce(
    nullif(p_meta ->> 'avatar_url', ''),
    nullif(p_meta ->> 'picture', ''),
    ''
  ), '');
$$;

-- ---------------------------------------------------------------------
-- Provisioning, now reading both spellings.
-- ---------------------------------------------------------------------
create or replace function public.provision_member(
  p_id uuid, p_email text, p_meta jsonb, p_email_confirmed timestamptz
) returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, first_name, avatar_url, verification_level)
  values (
    p_id,
    coalesce(public.identity_display_name(p_meta), 'Neighbour'),
    public.identity_avatar_url(p_meta),
    (case when p_email_confirmed is not null then 'email' else 'none' end)::verification_level
  )
  on conflict (id) do nothing;

  insert into public.user_private (user_id, email) values (p_id, p_email)
  on conflict (user_id) do update set email = excluded.email;

  insert into public.notification_prefs (user_id) values (p_id)
  on conflict (user_id) do nothing;
end $$;

-- ---------------------------------------------------------------------
-- Backfill for a profile that already existed.
--
-- Deliberately conservative: it fills a name only if it is still the
-- 'Neighbour' placeholder, and a picture only if there is none. Someone who
-- picked their own avatar keeps it, even if Google has a photo.
-- ---------------------------------------------------------------------
create or replace function public.sync_profile_from_identity()
returns jsonb
language plpgsql security definer set search_path = public, auth as $$
declare
  v_user  uuid := auth.uid();
  v_meta  jsonb;
  v_name  text;
  v_photo text;
  v_row   public.profiles;
begin
  if not public.is_member() then
    raise exception 'Sign in first' using errcode = '42501';
  end if;

  select raw_user_meta_data into v_meta from auth.users where id = v_user;
  if v_meta is null then
    return jsonb_build_object('ok', false, 'reason', 'no_identity');
  end if;

  v_name  := public.identity_display_name(v_meta);
  v_photo := public.identity_avatar_url(v_meta);

  update public.profiles p
     set first_name = case
           when coalesce(v_name, '') <> '' and p.first_name in ('Neighbour', '') then v_name
           else p.first_name end,
         avatar_url = case
           when coalesce(v_photo, '') <> '' and coalesce(p.avatar_url, '') = '' then v_photo
           else p.avatar_url end,
         updated_at = now()
   where p.id = v_user
  returning * into v_row;

  if v_row.id is null then
    return jsonb_build_object('ok', false, 'reason', 'no_profile');
  end if;

  return jsonb_build_object(
    'ok', true,
    'first_name', v_row.first_name,
    'avatar_url', v_row.avatar_url
  );
end $$;

-- ---------------------------------------------------------------------
-- Letting someone set their own.
--
-- `avatar_url` doubles as a preset marker: 'preset:<tool-type>' means "draw
-- the built-in illustration", which is how a person with no photo still gets
-- something recognisable. Constrained so the column cannot become a vector
-- for arbitrary remote URLs pointing anywhere.
-- ---------------------------------------------------------------------
create or replace function public.set_my_avatar(p_avatar text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_member() then
    raise exception 'Sign in first' using errcode = '42501';
  end if;

  if p_avatar is not null
     and p_avatar !~ '^preset:[a-z0-9-]{1,40}$'
     and p_avatar !~ '^https://[A-Za-z0-9._~:/?#@!$&''()*+,;=%-]{4,500}$' then
    raise exception 'Unsupported avatar' using errcode = '22023';
  end if;

  update public.profiles
     set avatar_url = p_avatar, updated_at = now()
   where id = auth.uid();
end $$;

create or replace function public.set_my_display_name(p_name text)
returns void
language plpgsql security definer set search_path = public as $$
declare v_name text := btrim(coalesce(p_name, ''));
begin
  if not public.is_member() then
    raise exception 'Sign in first' using errcode = '42501';
  end if;
  if char_length(v_name) < 1 or char_length(v_name) > 40 then
    raise exception 'A name needs to be 1-40 characters' using errcode = '22023';
  end if;

  update public.profiles
     set first_name = v_name, updated_at = now()
   where id = auth.uid();
end $$;

grant execute on function public.sync_profile_from_identity() to authenticated;
grant execute on function public.set_my_avatar(text)          to authenticated;
grant execute on function public.set_my_display_name(text)    to authenticated;
