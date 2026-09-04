-- =====================================================================
-- NailedIt — deletion & retention
--
-- One person deleting their account must not silently rewrite someone
-- else's history. The counterparty's transaction record and their
-- published ratings survive; the deleted person's identity does not.
--
-- Without this, deleting a profile fails outright on the foreign keys
-- from `transactions` — which would make in-app account deletion (a hard
-- Play Store requirement) impossible.
-- =====================================================================

alter table public.transactions
  alter column owner_id drop not null,
  alter column borrower_id drop not null;

alter table public.transactions
  drop constraint transactions_owner_id_fkey,
  add constraint transactions_owner_id_fkey
    foreign key (owner_id) references public.profiles(id) on delete set null;

alter table public.transactions
  drop constraint transactions_borrower_id_fkey,
  add constraint transactions_borrower_id_fkey
    foreign key (borrower_id) references public.profiles(id) on delete set null;

alter table public.disputes
  alter column opened_by drop not null;

alter table public.disputes
  drop constraint disputes_opened_by_fkey,
  add constraint disputes_opened_by_fkey
    foreign key (opened_by) references public.profiles(id) on delete set null;

-- Ratings WRITTEN by a deleted user are kept and anonymised (they are part of
-- the other person's reputation). Ratings ABOUT them go with their profile.
alter table public.ratings
  alter column rater_id drop not null;

alter table public.ratings
  drop constraint ratings_rater_id_fkey,
  add constraint ratings_rater_id_fkey
    foreign key (rater_id) references public.profiles(id) on delete set null;

-- ---------------------------------------------------------------------
-- The cascade chain, which is the part that is easy to miss.
--
-- `transactions.request_id` cascades from `borrow_requests`, and
-- `borrow_requests.borrower_id` cascaded from `profiles`. So deleting an
-- account silently deleted the borrow request, which cascade-deleted the
-- transaction — destroying the OTHER person's record of the exchange.
-- Found by running the deletion, not by reading the schema.
--
-- Same for conversations → messages: the thread has to survive as
-- tombstones, so the surviving participant's history still makes sense.
-- ---------------------------------------------------------------------

alter table public.borrow_requests
  alter column borrower_id drop not null,
  alter column owner_id drop not null;

alter table public.borrow_requests
  drop constraint borrow_requests_borrower_id_fkey,
  add constraint borrow_requests_borrower_id_fkey
    foreign key (borrower_id) references public.profiles(id) on delete set null;

alter table public.borrow_requests
  drop constraint borrow_requests_owner_id_fkey,
  add constraint borrow_requests_owner_id_fkey
    foreign key (owner_id) references public.profiles(id) on delete set null;

alter table public.conversations
  alter column owner_id drop not null,
  alter column borrower_id drop not null;

alter table public.conversations
  drop constraint conversations_owner_id_fkey,
  add constraint conversations_owner_id_fkey
    foreign key (owner_id) references public.profiles(id) on delete set null;

alter table public.conversations
  drop constraint conversations_borrower_id_fkey,
  add constraint conversations_borrower_id_fkey
    foreign key (borrower_id) references public.profiles(id) on delete set null;

alter table public.messages
  alter column sender_id drop not null;

alter table public.messages
  drop constraint messages_sender_id_fkey,
  add constraint messages_sender_id_fkey
    foreign key (sender_id) references public.profiles(id) on delete set null;

-- A NULL owner/borrower means "a former member". RLS must not then expose the
-- row to everyone: a null never equals auth.uid(), so the existing policies
-- already fail closed. Stated here so the next reader does not have to work it
-- out from first principles.
comment on column public.transactions.owner_id is
  'NULL means the account was deleted. Renders as "a former member".';
comment on column public.ratings.rater_id is
  'NULL means the rater deleted their account. The rating stays; the identity does not.';
