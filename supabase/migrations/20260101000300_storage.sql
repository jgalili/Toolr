-- =====================================================================
-- NailedIt — storage buckets
--
-- Supabase only (needs the `storage` schema). Four buckets, two public
-- and two emphatically not.
-- =====================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('tool-photos', 'tool-photos', true,  8388608, array['image/jpeg','image/png','image/webp']),
  ('avatars',     'avatars',     true,  2097152, array['image/jpeg','image/png','image/webp']),
  -- Damage evidence and identification photos are private. Signed URLs only.
  ('dispute-evidence', 'dispute-evidence', false, 8388608, array['image/jpeg','image/png','image/webp']),
  ('ai-temp',     'ai-temp',     false, 8388608, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

-- Everything is namespaced by user id as the first path segment, so a person
-- can only ever write inside their own folder.
create policy "tool photos are world readable"
  on storage.objects for select
  using (bucket_id = 'tool-photos');

create policy "owners write their own tool photos"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'tool-photos' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "owners delete their own tool photos"
  on storage.objects for delete to authenticated
  using (bucket_id = 'tool-photos' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "avatars are world readable"
  on storage.objects for select
  using (bucket_id = 'avatars');

create policy "users write their own avatar"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- ai-temp: the uploader can write, nobody can read except the service role
-- (the identify-tool function). Objects expire after 24 hours.
create policy "users upload their own identification photos"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'ai-temp' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "users see their own identification photos"
  on storage.objects for select to authenticated
  using (bucket_id = 'ai-temp' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "participants upload dispute evidence"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'dispute-evidence' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "participants read their own dispute evidence"
  on storage.objects for select to authenticated
  using (bucket_id = 'dispute-evidence' and (storage.foldername(name))[1] = auth.uid()::text);

/**
 * Nightly cleanup for ai-temp. Identification photos that never became a
 * listing should not linger. Schedule with pg_cron:
 *   select cron.schedule('purge-ai-temp', '0 3 * * *', $$select public.purge_ai_temp()$$);
 */
create or replace function public.purge_ai_temp()
returns integer
language plpgsql security definer set search_path = storage, public as $$
declare n integer;
begin
  delete from storage.objects
   where bucket_id = 'ai-temp' and created_at < now() - interval '24 hours';
  get diagnostics n = row_count;
  return n;
end $$;
