-- =====================================================================
-- NailedIt — clearing out old chats
--
-- "I can't delete items / old messages / edit stuff."
--
-- Items and editing are handled in 20260101001700. This is the chat half,
-- and it is the one place in the request where "delete" is the wrong verb.
--
-- A conversation has two people in it. If one of them deletes it, the other
-- loses their record of an exchange they were equally part of — including the
-- system messages that say when the tool was handed over and when it came
-- back, which is exactly what you want if a dispute comes up later. The rest
-- of this schema already takes that position (see the retention rules): your
-- own data goes when you go, but the other person's account of a shared event
-- does not go with it.
--
-- So: hidden for you, intact for them. It behaves like delete — the thread
-- leaves your list and stays gone — and it un-hides if they write again,
-- because a new message is not old mail.
-- =====================================================================

create table if not exists public.conversation_hides (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id         uuid not null references public.profiles(id) on delete cascade,
  hidden_at       timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

alter table public.conversation_hides enable row level security;

-- Your own hides, and nobody else's: whether someone has cleared a thread is
-- their business, not their counterparty's.
drop policy if exists conversation_hides_own on public.conversation_hides;
create policy conversation_hides_own on public.conversation_hides for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create index if not exists conversation_hides_user_idx
  on public.conversation_hides (user_id, conversation_id);

-- ---------------------------------------------------------------------
-- hide_conversation / unhide_conversation
--
-- Through functions rather than direct writes so that "am I in this
-- conversation at all" is checked once, server-side, instead of relying on a
-- policy that only knows about the hides table.
-- ---------------------------------------------------------------------
create or replace function public.hide_conversation(p_conversation_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare v_conv public.conversations;
begin
  select * into v_conv from public.conversations where id = p_conversation_id;
  if v_conv.id is null then
    raise exception 'That conversation is not available' using errcode = 'P0002';
  end if;
  if auth.uid() not in (v_conv.owner_id, v_conv.borrower_id) then
    raise exception 'Not your conversation' using errcode = '42501';
  end if;

  insert into public.conversation_hides (conversation_id, user_id)
  values (p_conversation_id, auth.uid())
  on conflict (conversation_id, user_id) do update set hidden_at = now();
end $$;

create or replace function public.unhide_conversation(p_conversation_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  delete from public.conversation_hides
   where conversation_id = p_conversation_id and user_id = auth.uid();
end $$;

grant execute on function public.hide_conversation(uuid)   to authenticated;
grant execute on function public.unhide_conversation(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- A new message brings the thread back
--
-- Without this, clearing a chat would silently mute that person forever, and
-- the first the borrower would know of it is when their message went
-- unanswered. Hiding is for tidiness, not for blocking — blocking has its own
-- table and its own consequences.
-- ---------------------------------------------------------------------
create or replace function public.unhide_on_new_message()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from public.conversation_hides
   where conversation_id = new.conversation_id
     and user_id <> new.sender_id;
  return new;
end $$;

drop trigger if exists trg_unhide_on_new_message on public.messages;
create trigger trg_unhide_on_new_message
  after insert on public.messages
  for each row execute function public.unhide_on_new_message();
