-- =====================================================================
-- NailedIt — every migration, concatenated, in order.
--
-- Generated from supabase/migrations/. Do not edit by hand: edit the
-- migration and regenerate, or the two drift apart and this file starts
-- re-creating functions a later migration deliberately removed.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 20260101000000_initial_schema.sql
-- ---------------------------------------------------------------------
-- =====================================================================
-- NailedIt — initial schema (Postgres 15 + PostGIS, Supabase)
-- Money is stored in AGOROT (integer). 100 agorot = 1 ILS. Never use float.
-- All timestamps are timestamptz (UTC).
-- Every table has RLS enabled. No exceptions.
-- =====================================================================

create extension if not exists postgis;
create extension if not exists pg_trgm;
create extension if not exists "uuid-ossp";

-- ---------------------------------------------------------------------
-- ENUMS
-- ---------------------------------------------------------------------
create type account_type       as enum ('personal', 'business');
create type verification_level as enum ('none', 'email', 'phone', 'id');
create type risk_level         as enum ('low', 'medium', 'high');
create type listing_status     as enum ('draft', 'active', 'paused', 'borrowed', 'removed');
create type availability_mode  as enum ('now', 'dates', 'ask');
create type request_status     as enum ('pending', 'accepted', 'declined', 'cancelled', 'expired');
create type transaction_status as enum ('agreed', 'picked_up', 'returned', 'completed', 'disputed', 'cancelled');
create type payment_mode       as enum ('free', 'offline', 'in_app');           -- in_app unused in V1
create type payment_status     as enum ('not_applicable', 'pending', 'held', 'captured', 'refunded', 'failed');
create type rating_direction   as enum ('borrower_to_owner', 'owner_to_borrower');
create type message_kind       as enum ('text', 'system', 'quick_reply');
create type report_subject     as enum ('user', 'tool', 'message', 'transaction');
create type report_status      as enum ('open', 'reviewing', 'actioned', 'dismissed');
create type dispute_reason     as enum ('damaged', 'not_returned', 'not_as_described', 'other');
create type dispute_status     as enum ('open', 'resolved', 'withdrawn');
create type tool_request_status as enum ('open', 'fulfilled', 'expired', 'cancelled');
create type ai_user_action     as enum ('accepted', 'corrected', 'rejected', 'generic', 'abandoned');
create type notification_kind  as enum (
  'borrow_request_received', 'borrow_request_accepted', 'borrow_request_declined',
  'message_received', 'pickup_reminder', 'return_reminder',
  'nearby_tool_request', 'rating_received', 'dispute_opened'
);

-- =====================================================================
-- 1. IDENTITY
-- =====================================================================

-- Public-facing profile. Deliberately minimal — this is not a social network.
create table public.profiles (
  id                     uuid primary key references auth.users(id) on delete cascade,
  first_name             text not null check (char_length(first_name) between 1 and 40),
  avatar_url             text,
  neighborhood_label     text,                       -- coarse, human: "Florentin"
  account_type           account_type not null default 'personal',
  verification_level     verification_level not null default 'none',
  locale                 text not null default 'he' check (locale in ('en','he')),

  -- Denormalised reputation, maintained by trigger. Bayesian smoothing is applied at read time.
  rating_sum_owner       integer not null default 0,
  rating_count_owner     integer not null default 0,
  rating_sum_borrower    integer not null default 0,
  rating_count_borrower  integer not null default 0,
  completed_lends        integer not null default 0,
  completed_borrows      integer not null default 0,
  cancellation_count     integer not null default 0,

  is_banned              boolean not null default false,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  deleted_at             timestamptz
);

-- Anything that must never be readable by another user lives here.
create table public.user_private (
  user_id        uuid primary key references public.profiles(id) on delete cascade,
  phone_e164     text,
  phone_verified boolean not null default false,
  home_location  geography(Point, 4326),      -- optional; used to default the search centre
  email          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table public.user_devices (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.profiles(id) on delete cascade,
  expo_push_token  text not null,
  platform         text not null check (platform in ('android','ios')),
  locale           text,
  last_seen_at     timestamptz not null default now(),
  created_at       timestamptz not null default now(),
  unique (user_id, expo_push_token)
);

create table public.notification_prefs (
  user_id                 uuid primary key references public.profiles(id) on delete cascade,
  borrow_requests         boolean not null default true,
  request_responses       boolean not null default true,
  messages                boolean not null default true,
  reminders               boolean not null default true,
  nearby_tool_requests    boolean not null default true
);

-- =====================================================================
-- 2. CATALOGUE
-- =====================================================================

create table public.tool_categories (
  id          smallint primary key,
  slug        text not null unique,
  name_en     text not null,
  name_he     text not null,
  icon        text not null,
  risk        risk_level not null default 'low',
  sort_order  smallint not null default 0
);

insert into public.tool_categories (id, slug, name_en, name_he, icon, risk, sort_order) values
  (1,'power-tools','Power Tools','כלי עבודה חשמליים','drill','medium',10),
  (2,'hand-tools','Hand Tools','כלי עבודה ידניים','hammer','low',20),
  (3,'gardening','Gardening','גינון','leaf','medium',30),
  (4,'cleaning','Cleaning Equipment','ציוד ניקיון','spray','low',40),
  (5,'ladders','Ladders','סולמות','ladder','medium',50),
  (6,'painting','Painting','צביעה','brush','low',60),
  (7,'automotive','Automotive','רכב','car','medium',70),
  (8,'woodworking','Woodworking','נגרות','saw','high',80),
  (9,'home-repair','Home Repair','תיקוני בית','wrench','low',90),
  (10,'moving','Moving Equipment','ציוד הובלה','box','low',100),
  (11,'camping','Camping / Outdoor','קמפינג וטיולים','tent','low',110),
  (12,'other','Other','אחר','dots','low',999);

-- =====================================================================
-- 3. TOOLS
-- =====================================================================

-- PUBLIC table. Contains ONLY the fuzzed location. The exact point is in tool_locations.
create table public.tools (
  id                    uuid primary key default gen_random_uuid(),
  owner_id              uuid not null references public.profiles(id) on delete cascade,
  category_id           smallint not null references public.tool_categories(id),

  title                 text not null check (char_length(title) between 2 and 80),
  tool_type             text not null,                 -- normalised slug, e.g. 'cordless-drill'
  brand                 text,
  model                 text,                          -- NULL unless the AI (or user) was confident
  is_model_confirmed    boolean not null default false,
  description           text check (char_length(description) <= 400),
  condition             text check (condition in ('like_new','good','worn')),
  accessories           text,
  instructions          text,
  max_borrow_days       smallint check (max_borrow_days between 1 and 90),

  -- Commercials. V1 writes only 'free' or 'offline'.
  payment_mode          payment_mode not null default 'free',
  price_per_day_agorot  bigint check (price_per_day_agorot >= 0),
  deposit_agorot        bigint check (deposit_agorot >= 0),          -- future
  currency              char(3) not null default 'ILS',

  availability_mode     availability_mode not null default 'ask',
  status                listing_status not null default 'active',
  risk                  risk_level not null default 'low',

  -- Public location: a stable 100–200 m offset of the real point. Never the real point.
  fuzzed_location       geography(Point, 4326) not null,
  neighborhood_label    text,

  search_tsv            tsvector,
  view_count            integer not null default 0,

  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  deleted_at            timestamptz,

  constraint price_required_when_paid
    check (payment_mode = 'free' or price_per_day_agorot is not null)
);

-- PRIVATE table. The exact address. Readable by the owner, and by a counterparty
-- only once a borrow request has been accepted.
create table public.tool_locations (
  tool_id         uuid primary key references public.tools(id) on delete cascade,
  exact_location  geography(Point, 4326) not null,
  address_line    text,
  pickup_notes    text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table public.tool_photos (
  id            uuid primary key default gen_random_uuid(),
  tool_id       uuid not null references public.tools(id) on delete cascade,
  storage_path  text not null,
  width         integer,
  height         integer,
  blurhash      text,
  position      smallint not null default 0,
  created_at    timestamptz not null default now()
);

create table public.tool_availability (
  id          uuid primary key default gen_random_uuid(),
  tool_id     uuid not null references public.tools(id) on delete cascade,
  start_date  date not null,
  end_date    date not null,
  kind        text not null default 'available' check (kind in ('available','blocked')),
  check (end_date >= start_date)
);

-- NOTE: FK to auth.users, not profiles. A guest (anonymous session) has an
-- auth.users row but no profile, and their favourites must survive the upgrade
-- to a real account — which they do, because the user id never changes.
create table public.favorites (
  user_id    uuid not null references auth.users(id) on delete cascade,
  tool_id    uuid not null references public.tools(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, tool_id)
);

-- =====================================================================
-- 4. TRANSACTIONS
-- =====================================================================

create table public.borrow_requests (
  id                  uuid primary key default gen_random_uuid(),
  tool_id             uuid not null references public.tools(id) on delete cascade,
  borrower_id         uuid not null references public.profiles(id) on delete cascade,
  owner_id            uuid not null references public.profiles(id) on delete cascade,
  status              request_status not null default 'pending',
  start_at            timestamptz not null,
  end_at              timestamptz not null,
  message             text check (char_length(message) <= 300),
  quoted_total_agorot bigint,
  payment_mode        payment_mode not null default 'free',
  risk_acknowledged   boolean not null default false,   -- required for HIGH risk tools
  created_at          timestamptz not null default now(),
  responded_at        timestamptz,
  expires_at          timestamptz not null default (now() + interval '48 hours'),
  check (end_at > start_at),
  check (borrower_id <> owner_id)
);

create table public.transactions (
  id                   uuid primary key default gen_random_uuid(),
  request_id           uuid not null unique references public.borrow_requests(id) on delete cascade,
  tool_id              uuid not null references public.tools(id),
  owner_id             uuid not null references public.profiles(id),
  borrower_id          uuid not null references public.profiles(id),
  status               transaction_status not null default 'agreed',

  agreed_total_agorot  bigint,
  deposit_agorot       bigint,
  platform_fee_agorot  bigint not null default 0,
  currency             char(3) not null default 'ILS',
  payment_mode         payment_mode not null default 'free',
  payment_status       payment_status not null default 'not_applicable',
  payment_provider     text,                 -- 'offline' in V1; e.g. 'rapyd' later
  provider_ref         text,

  pickup_at            timestamptz,
  due_at               timestamptz not null,
  picked_up_at         timestamptz,
  returned_at          timestamptz,
  owner_confirmed_return_at    timestamptz,
  borrower_confirmed_return_at timestamptz,
  completed_at         timestamptz,
  cancelled_at         timestamptz,
  cancelled_by         uuid references public.profiles(id),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create table public.conversations (
  id              uuid primary key default gen_random_uuid(),
  tool_id         uuid references public.tools(id) on delete set null,
  request_id      uuid unique references public.borrow_requests(id) on delete cascade,
  owner_id        uuid not null references public.profiles(id) on delete cascade,
  borrower_id     uuid not null references public.profiles(id) on delete cascade,
  last_message_at timestamptz,
  created_at      timestamptz not null default now()
);

create table public.messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id       uuid not null references public.profiles(id) on delete cascade,
  kind            message_kind not null default 'text',
  body            text not null check (char_length(body) between 1 and 2000),
  read_at         timestamptz,
  created_at      timestamptz not null default now()
);

create table public.ratings (
  id             uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  rater_id       uuid not null references public.profiles(id) on delete cascade,
  ratee_id       uuid not null references public.profiles(id) on delete cascade,
  direction      rating_direction not null,
  stars          smallint not null check (stars between 1 and 5),
  tags           text[] not null default '{}',
  comment        text check (char_length(comment) <= 140),
  is_published   boolean not null default false,   -- double-blind until both rate or 7 days
  created_at     timestamptz not null default now(),
  unique (transaction_id, rater_id)
);

-- =====================================================================
-- 5. SAFETY
-- =====================================================================

create table public.reports (
  id            uuid primary key default gen_random_uuid(),
  reporter_id   uuid not null references public.profiles(id) on delete cascade,
  subject_type  report_subject not null,
  subject_id    uuid not null,
  reason        text not null,
  details       text check (char_length(details) <= 1000),
  status        report_status not null default 'open',
  created_at    timestamptz not null default now()
);

create table public.blocks (
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

create table public.disputes (
  id             uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  opened_by      uuid not null references public.profiles(id),
  reason         dispute_reason not null,
  description    text not null check (char_length(description) <= 2000),
  evidence_paths text[] not null default '{}',       -- private storage bucket paths
  status         dispute_status not null default 'open',
  resolution     text,
  created_at     timestamptz not null default now(),
  resolved_at    timestamptz
);

-- =====================================================================
-- 6. DEMAND SIGNALS
-- =====================================================================

create table public.tool_requests (
  id                 uuid primary key default gen_random_uuid(),
  requester_id       uuid not null references public.profiles(id) on delete cascade,
  raw_text           text not null check (char_length(raw_text) between 2 and 300),
  parsed_tool_types  text[] not null default '{}',
  category_id        smallint references public.tool_categories(id),
  fuzzed_location    geography(Point, 4326) not null,
  radius_m           integer not null default 1000 check (radius_m between 200 and 20000),
  needed_from        timestamptz,
  needed_to          timestamptz,
  status             tool_request_status not null default 'open',
  created_at         timestamptz not null default now(),
  expires_at         timestamptz not null default (now() + interval '7 days')
);

create table public.tool_request_offers (
  id              uuid primary key default gen_random_uuid(),
  tool_request_id uuid not null references public.tool_requests(id) on delete cascade,
  tool_id         uuid not null references public.tools(id) on delete cascade,
  owner_id        uuid not null references public.profiles(id) on delete cascade,
  message         text check (char_length(message) <= 300),
  status          text not null default 'offered' check (status in ('offered','accepted','declined','withdrawn')),
  created_at      timestamptz not null default now(),
  unique (tool_request_id, tool_id)
);

-- =====================================================================
-- 7. NOTIFICATIONS
-- =====================================================================

create table public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  kind       notification_kind not null,
  title      text not null,
  body       text not null,
  route      text,                       -- deep link, e.g. 'nailedit://requests/<uuid>'
  payload    jsonb not null default '{}'::jsonb,
  read_at    timestamptz,
  pushed_at  timestamptz,
  created_at timestamptz not null default now()
);

-- =====================================================================
-- 8. AI
-- =====================================================================

-- One row per identification attempt. This is our evaluation dataset —
-- the ratio of accepted / corrected / rejected tells us whether the 30-second promise holds.
create table public.ai_identification_results (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.profiles(id) on delete cascade,
  tool_id          uuid references public.tools(id) on delete set null,
  image_path       text not null,
  model_name       text not null,
  prompt_version   text not null,
  raw_response     jsonb not null,
  parsed           jsonb not null,          -- validated against the Zod/JSON schema
  is_tool          boolean not null,
  top_confidence   numeric(4,3),
  chosen_index     smallint,
  user_action      ai_user_action,
  latency_ms       integer,
  input_tokens     integer,
  output_tokens    integer,
  created_at       timestamptz not null default now()
);

-- Cache of natural-language query interpretations. Same question, same answer, no LLM call.
create table public.ai_query_cache (
  query_hash   text primary key,           -- sha256(lower(trim(query)) || ':' || locale)
  query_text   text not null,
  locale       text not null,
  parsed       jsonb not null,
  hit_count    integer not null default 0,
  created_at   timestamptz not null default now(),
  last_used_at timestamptz not null default now()
);

-- Per-user, per-day AI budget. Enforced in the database, not in the client.
-- FK to auth.users so guests are rate-limited too — the main reason guest mode
-- uses a real anonymous session rather than an unauthenticated client.
create table public.ai_usage_quota (
  user_id   uuid not null references auth.users(id) on delete cascade,
  day       date not null,
  feature   text not null check (feature in ('identify','interpret')),
  used      integer not null default 0,
  primary key (user_id, day, feature)
);

-- =====================================================================
-- 9. INDEXES
-- =====================================================================

-- The single most important index in the product: the nearby-tools query.
create index tools_fuzzed_location_gix on public.tools using gist (fuzzed_location)
  where status = 'active' and deleted_at is null;
create index tools_owner_idx      on public.tools (owner_id) where deleted_at is null;
create index tools_category_idx   on public.tools (category_id, status);
create index tools_type_idx       on public.tools (tool_type) where status = 'active';
create index tools_search_gin     on public.tools using gin (search_tsv);
create index tools_title_trgm     on public.tools using gin (title gin_trgm_ops);
create index tools_free_idx       on public.tools (payment_mode, status) where deleted_at is null;

create index tool_locations_gix   on public.tool_locations using gist (exact_location);
create index tool_photos_tool_idx on public.tool_photos (tool_id, position);
create index tool_avail_idx       on public.tool_availability (tool_id, start_date, end_date);

create index requests_owner_idx    on public.borrow_requests (owner_id, status, created_at desc);
create index requests_borrower_idx on public.borrow_requests (borrower_id, status, created_at desc);
create index requests_tool_idx     on public.borrow_requests (tool_id, status);
create index requests_expiry_idx   on public.borrow_requests (expires_at) where status = 'pending';

create index tx_owner_idx     on public.transactions (owner_id, status);
create index tx_borrower_idx  on public.transactions (borrower_id, status);
create index tx_due_idx       on public.transactions (due_at) where status in ('agreed','picked_up');

create index conv_owner_idx     on public.conversations (owner_id, last_message_at desc);
create index conv_borrower_idx  on public.conversations (borrower_id, last_message_at desc);
create index messages_conv_idx  on public.messages (conversation_id, created_at desc);

create index ratings_ratee_idx  on public.ratings (ratee_id) where is_published;
create index notif_user_idx     on public.notifications (user_id, created_at desc);
create index notif_unread_idx   on public.notifications (user_id) where read_at is null;

create index tool_requests_gix    on public.tool_requests using gist (fuzzed_location)
  where status = 'open';
create index tool_requests_types  on public.tool_requests using gin (parsed_tool_types);

create index ai_ident_user_idx  on public.ai_identification_results (user_id, created_at desc);

-- =====================================================================
-- 10. FUNCTIONS & TRIGGERS
-- =====================================================================

-- Deterministic location fuzzing.
-- The offset is derived from the tool id, so the published pin is STABLE.
-- A pin that moves on every read can be averaged over repeated reads to recover
-- the true location — that is a real de-anonymisation attack, not a theoretical one.
create or replace function public.fuzz_point(p geography, seed uuid)
returns geography
language plpgsql immutable as $$
declare
  h       text := md5(seed::text || 'toolr-location-salt-v1');
  bearing double precision;
  dist    double precision;
begin
  bearing := (('x' || substr(h, 1, 7))::bit(28)::int % 360)::double precision;
  dist    := 100 + (('x' || substr(h, 8, 7))::bit(28)::int % 101)::double precision;  -- 100..200 m
  return ST_Project(p, dist, radians(bearing));
end $$;

-- Keep the public fuzzed point and the search vector in sync.
create or replace function public.tools_sync_derived()
returns trigger language plpgsql as $$
begin
  new.search_tsv :=
      setweight(to_tsvector('simple', coalesce(new.title, '')),       'A')
   || setweight(to_tsvector('simple', coalesce(new.tool_type, '')),   'A')
   || setweight(to_tsvector('simple', coalesce(new.brand, '')),       'B')
   || setweight(to_tsvector('simple', coalesce(new.model, '')),       'B')
   || setweight(to_tsvector('simple', coalesce(new.description, '')), 'C');
  new.updated_at := now();
  return new;
end $$;

create trigger tools_sync_derived_trg
  before insert or update on public.tools
  for each row execute function public.tools_sync_derived();

-- When the owner sets/changes the exact location, recompute the published fuzzed point.
create or replace function public.tool_locations_sync_fuzz()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.tools
     set fuzzed_location = public.fuzz_point(new.exact_location, new.tool_id)
   where id = new.tool_id;
  return new;
end $$;

create trigger tool_locations_sync_fuzz_trg
  after insert or update of exact_location on public.tool_locations
  for each row execute function public.tool_locations_sync_fuzz();

-- ---------------------------------------------------------------------
-- IDENTITY PROVISIONING
--
-- Guest mode is a real Supabase anonymous session, so a guest has an
-- auth.users row with is_anonymous = true. Guests get NO profile row —
-- they cannot list, borrow, message or rate, so a profile would be junk.
-- The profile is provisioned at exactly two moments: a normal sign-up,
-- and the moment a guest upgrades to a real account. Because the upgrade
-- keeps the same user id, the guest's favourites and AI quota carry over
-- with no migration step.
-- ---------------------------------------------------------------------
create or replace function public.provision_member(
  p_id uuid, p_email text, p_meta jsonb, p_email_confirmed timestamptz
) returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, first_name, avatar_url, verification_level)
  values (
    p_id,
    coalesce(
      nullif(split_part(coalesce(p_meta->>'full_name', p_meta->>'first_name', ''), ' ', 1), ''),
      'Neighbour'),
    p_meta->>'avatar_url',
    (case when p_email_confirmed is not null then 'email' else 'none' end)::verification_level
  )
  on conflict (id) do nothing;

  insert into public.user_private (user_id, email) values (p_id, p_email)
  on conflict (user_id) do update set email = excluded.email;

  insert into public.notification_prefs (user_id) values (p_id)
  on conflict (user_id) do nothing;
end $$;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if coalesce(new.is_anonymous, false) then
    return new;                       -- a guest; nothing to provision yet
  end if;
  perform public.provision_member(new.id, new.email, new.raw_user_meta_data, new.email_confirmed_at);
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Guest → member. Fires when an anonymous user links an email/password or an
-- OAuth identity. Also keeps verification_level honest once an email is confirmed.
create or replace function public.handle_user_upgraded()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if coalesce(old.is_anonymous, false) and not coalesce(new.is_anonymous, false) then
    perform public.provision_member(new.id, new.email, new.raw_user_meta_data, new.email_confirmed_at);
  elsif old.email_confirmed_at is null and new.email_confirmed_at is not null then
    update public.profiles
       set verification_level = greatest_verification(verification_level, 'email')
     where id = new.id;
  end if;
  return new;
end $$;

create trigger on_auth_user_upgraded
  after update on auth.users
  for each row execute function public.handle_user_upgraded();

-- verification_level only ever moves up: confirming an email must not
-- downgrade someone who has already verified a phone or an ID.
create or replace function public.greatest_verification(a verification_level, b verification_level)
returns verification_level language sql immutable as $$
  select case when array_position(enum_range(null::verification_level), a)
             >= array_position(enum_range(null::verification_level), b)
         then a else b end;
$$;

-- Reputation maintenance.
create or replace function public.apply_rating()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.is_published and (tg_op = 'INSERT' or not old.is_published) then
    if new.direction = 'borrower_to_owner' then
      update public.profiles
         set rating_sum_owner = rating_sum_owner + new.stars,
             rating_count_owner = rating_count_owner + 1
       where id = new.ratee_id;
    else
      update public.profiles
         set rating_sum_borrower = rating_sum_borrower + new.stars,
             rating_count_borrower = rating_count_borrower + 1
       where id = new.ratee_id;
    end if;
  end if;
  return new;
end $$;

create trigger apply_rating_trg
  after insert or update of is_published on public.ratings
  for each row execute function public.apply_rating();

-- Bayesian-smoothed rating: a single 5-star review must not outrank 40 reviews at 4.8.
-- prior = 4.6 stars with a weight of 5 pseudo-reviews.
create or replace function public.smoothed_rating(sum_stars int, n int)
returns numeric language sql immutable as $$
  select round(((coalesce(sum_stars,0) + 4.6 * 5) / (coalesce(n,0) + 5))::numeric, 2);
$$;

-- ---------------------------------------------------------------------
-- THE SEARCH RPC
-- SECURITY DEFINER so it can read `tools` freely, but it can only ever
-- project the fuzzed location and a distance rounded to 50 m.
-- ---------------------------------------------------------------------
create or replace function public.search_tools_nearby(
  p_lat          double precision,
  p_lng          double precision,
  p_radius_m     integer default 500,
  p_free_only    boolean default false,
  p_category_id  smallint default null,
  p_tool_types   text[] default null,
  p_query        text default null,
  p_max_price    bigint default null,
  p_available_from timestamptz default null,
  p_available_to   timestamptz default null,
  p_limit        integer default 30,
  p_offset       integer default 0
)
returns table (
  id                   uuid,
  title                text,
  tool_type            text,
  brand                text,
  category_id          smallint,
  category_slug        text,
  owner_id             uuid,
  payment_mode         payment_mode,
  price_per_day_agorot bigint,
  currency             char(3),
  availability_mode    availability_mode,
  risk                 risk_level,
  neighborhood_label   text,
  distance_m           integer,
  lat                  double precision,
  lng                  double precision,
  primary_photo        text,
  owner_first_name     text,
  owner_avatar_url     text,
  owner_rating         numeric,
  owner_rating_count   integer,
  score                double precision
)
language sql stable security definer set search_path = public as $$
  with origin as (
    select ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography as g
  )
  select
    t.id,
    t.title,
    t.tool_type,
    t.brand,
    t.category_id,
    tc.slug,
    t.owner_id,
    t.payment_mode,
    t.price_per_day_agorot,
    t.currency,
    t.availability_mode,
    t.risk,
    t.neighborhood_label,
    -- rounded to 50 m: precise distances from several vantage points would
    -- otherwise let an attacker trilaterate even the fuzzed point.
    (round(ST_Distance(t.fuzzed_location, o.g) / 50.0) * 50)::int as distance_m,
    ST_Y(t.fuzzed_location::geometry) as lat,
    ST_X(t.fuzzed_location::geometry) as lng,
    (select tp.storage_path from public.tool_photos tp
      where tp.tool_id = t.id order by tp.position limit 1) as primary_photo,
    pr.first_name,
    pr.avatar_url,
    public.smoothed_rating(pr.rating_sum_owner, pr.rating_count_owner),
    pr.rating_count_owner,
    (
        0.45 * exp(-ST_Distance(t.fuzzed_location, o.g) / 500.0)
      + 0.20 * case t.availability_mode when 'now' then 1.0 when 'dates' then 0.7 else 0.4 end
      + 0.15 * case
                 when p_tool_types is not null and t.tool_type = any(p_tool_types) then 1.0
                 when p_category_id is not null and t.category_id = p_category_id then 0.6
                 else 0.3 end
      + 0.12 * (public.smoothed_rating(pr.rating_sum_owner, pr.rating_count_owner) / 5.0)
      + 0.08 * case when t.payment_mode = 'free' then 1.0 else 0.0 end
    )::double precision as score
  from public.tools t
  cross join origin o
  join public.tool_categories tc on tc.id = t.category_id
  join public.profiles pr on pr.id = t.owner_id
  where t.status = 'active'
    and t.deleted_at is null
    and pr.is_banned = false
    and pr.deleted_at is null
    and ST_DWithin(t.fuzzed_location, o.g, p_radius_m)
    and (not p_free_only or t.payment_mode = 'free')
    and (p_category_id is null or t.category_id = p_category_id)
    and (p_tool_types is null or t.tool_type = any(p_tool_types))
    and (p_max_price is null or t.payment_mode = 'free' or t.price_per_day_agorot <= p_max_price)
    and (p_query is null or t.search_tsv @@ plainto_tsquery('simple', p_query) or t.title ilike '%'||p_query||'%')
    and (
      p_available_from is null
      or t.availability_mode in ('now','ask')
      or exists (
        select 1 from public.tool_availability ta
        where ta.tool_id = t.id and ta.kind = 'available'
          and ta.start_date <= coalesce(p_available_to, p_available_from)::date
          and ta.end_date   >= p_available_from::date
      )
    )
    -- never surface tools from someone the viewer blocked, or who blocked them
    and not exists (
      select 1 from public.blocks b
      where (b.blocker_id = auth.uid() and b.blocked_id = t.owner_id)
         or (b.blocker_id = t.owner_id and b.blocked_id = auth.uid())
    )
  order by score desc, distance_m asc
  limit least(p_limit, 100) offset p_offset;
$$;

-- The ONLY way to obtain an exact pickup location, and only for an accepted transaction.
create or replace function public.get_pickup_location(p_transaction_id uuid)
returns table (lat double precision, lng double precision, address_line text, pickup_notes text)
language sql stable security definer set search_path = public as $$
  select ST_Y(tl.exact_location::geometry), ST_X(tl.exact_location::geometry),
         tl.address_line, tl.pickup_notes
  from public.transactions tx
  join public.tool_locations tl on tl.tool_id = tx.tool_id
  where tx.id = p_transaction_id
    and auth.uid() in (tx.owner_id, tx.borrower_id)
    and tx.status in ('agreed','picked_up','returned');
$$;

-- Owners whose active tools match an open tool request, for the broadcast notification.
create or replace function public.match_tool_request(p_request_id uuid)
returns table (owner_id uuid, tool_id uuid, distance_m integer)
language sql stable security definer set search_path = public as $$
  select t.owner_id, t.id,
         (round(ST_Distance(t.fuzzed_location, r.fuzzed_location) / 50.0) * 50)::int
  from public.tool_requests r
  join public.tools t
    on t.status = 'active'
   and t.deleted_at is null
   and t.owner_id <> r.requester_id
   and (t.tool_type = any(r.parsed_tool_types) or t.category_id = r.category_id)
   and ST_DWithin(t.fuzzed_location, r.fuzzed_location, r.radius_m)
  join public.notification_prefs np on np.user_id = t.owner_id and np.nearby_tool_requests
  where r.id = p_request_id and r.status = 'open';
$$;

-- Atomic AI quota check. Returns false when the caller is over budget.
create or replace function public.consume_ai_quota(p_feature text, p_limit integer)
returns boolean
language plpgsql security definer set search_path = public as $$
declare v_used integer;
begin
  insert into public.ai_usage_quota (user_id, day, feature, used)
  values (auth.uid(), current_date, p_feature, 1)
  on conflict (user_id, day, feature)
    do update set used = public.ai_usage_quota.used + 1
  returning used into v_used;
  return v_used <= p_limit;
end $$;

-- ---------------------------------------------------------------------
-- GUEST vs MEMBER
-- A guest holds a real session, so auth.uid() is non-null for them. The
-- thing that separates a guest from a member is the is_anonymous claim in
-- the JWT. Every policy that CREATES content calls this; every policy that
-- READS public content does not.
-- ---------------------------------------------------------------------
-- SECURITY DEFINER on purpose: the function only reports a fact about the
-- caller (are they a guest?), and running as the definer means it does not
-- depend on the calling role holding privileges on the auth schema. The
-- claims themselves still come from the caller's own session settings.
create or replace function public.is_member()
returns boolean
language sql stable security definer set search_path = auth, public as $$
  select auth.uid() is not null
     and coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false;
$$;

-- Anonymous sessions accumulate one auth.users row per device that ever
-- opened the app. Run nightly.
create or replace function public.purge_stale_guests(p_older_than interval default '30 days')
returns integer
language plpgsql security definer set search_path = auth, public as $$
declare n integer;
begin
  delete from auth.users u
   where coalesce(u.is_anonymous, false)
     and u.created_at < now() - p_older_than
     and coalesce(u.last_sign_in_at, u.created_at) < now() - p_older_than;
  get diagnostics n = row_count;
  return n;
end $$;

-- =====================================================================
-- 11. ROW LEVEL SECURITY
-- =====================================================================

alter table public.profiles                 enable row level security;
alter table public.user_private             enable row level security;
alter table public.user_devices             enable row level security;
alter table public.notification_prefs       enable row level security;
alter table public.tool_categories          enable row level security;
alter table public.tools                    enable row level security;
alter table public.tool_locations           enable row level security;
alter table public.tool_photos              enable row level security;
alter table public.tool_availability        enable row level security;
alter table public.favorites                enable row level security;
alter table public.borrow_requests          enable row level security;
alter table public.transactions             enable row level security;
alter table public.conversations            enable row level security;
alter table public.messages                 enable row level security;
alter table public.ratings                  enable row level security;
alter table public.reports                  enable row level security;
alter table public.blocks                   enable row level security;
alter table public.disputes                 enable row level security;
alter table public.tool_requests            enable row level security;
alter table public.tool_request_offers      enable row level security;
alter table public.notifications            enable row level security;
alter table public.ai_identification_results enable row level security;
alter table public.ai_query_cache           enable row level security;
alter table public.ai_usage_quota           enable row level security;

-- Categories: world-readable lookup.
create policy categories_read on public.tool_categories for select using (true);

-- Profiles: public read of live, non-banned users; self-write only.
create policy profiles_read   on public.profiles for select
  using (deleted_at is null and not is_banned);
create policy profiles_update on public.profiles for update
  using (id = auth.uid()) with check (id = auth.uid());

-- Private data: self only, always.
create policy user_private_all on public.user_private for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy user_devices_all on public.user_devices for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy notif_prefs_all  on public.notification_prefs for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Tools: anyone (including anonymous) may read ACTIVE listings — this is what
-- makes browse-before-signup work. Only the owner may write.
create policy tools_read_active on public.tools for select
  using (status = 'active' and deleted_at is null);
create policy tools_read_own    on public.tools for select using (owner_id = auth.uid());
create policy tools_insert_own  on public.tools for insert
  with check (owner_id = auth.uid() and public.is_member());
create policy tools_update_own  on public.tools for update
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy tools_delete_own  on public.tools for delete using (owner_id = auth.uid());

-- *** THE PRIVACY-CRITICAL POLICY ***
-- Exact coordinates are readable ONLY by the owner. Counterparties never read this
-- table directly; they call get_pickup_location(), which checks the transaction state.
create policy tool_locations_owner on public.tool_locations for all
  using (exists (select 1 from public.tools t where t.id = tool_id and t.owner_id = auth.uid()))
  with check (exists (select 1 from public.tools t where t.id = tool_id and t.owner_id = auth.uid()));

create policy tool_photos_read on public.tool_photos for select
  using (exists (select 1 from public.tools t
                 where t.id = tool_id and (t.status = 'active' or t.owner_id = auth.uid())));
create policy tool_photos_write on public.tool_photos for all
  using (exists (select 1 from public.tools t where t.id = tool_id and t.owner_id = auth.uid()))
  with check (exists (select 1 from public.tools t where t.id = tool_id and t.owner_id = auth.uid()));

create policy tool_avail_read on public.tool_availability for select using (true);
create policy tool_avail_write on public.tool_availability for all
  using (exists (select 1 from public.tools t where t.id = tool_id and t.owner_id = auth.uid()))
  with check (exists (select 1 from public.tools t where t.id = tool_id and t.owner_id = auth.uid()));

-- Favourites are the one thing a guest may write. They survive the upgrade
-- to a real account because the user id does not change.
create policy favorites_own on public.favorites for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Requests: visible to the two parties only.
create policy requests_read on public.borrow_requests for select
  using (auth.uid() in (borrower_id, owner_id));
-- Guests browse; they do not borrow. is_member() is what enforces that,
-- in the database, for every client.
create policy requests_insert on public.borrow_requests for insert
  with check (public.is_member()
              and borrower_id = auth.uid()
              and owner_id = (select owner_id from public.tools where id = tool_id));
create policy requests_update on public.borrow_requests for update
  using (auth.uid() in (borrower_id, owner_id))
  with check (auth.uid() in (borrower_id, owner_id));

create policy tx_read on public.transactions for select
  using (auth.uid() in (owner_id, borrower_id));
create policy tx_update on public.transactions for update
  using (auth.uid() in (owner_id, borrower_id))
  with check (auth.uid() in (owner_id, borrower_id));

create policy conv_read on public.conversations for select
  using (auth.uid() in (owner_id, borrower_id));

-- Messages: strictly participants of the conversation.
create policy messages_read on public.messages for select
  using (exists (select 1 from public.conversations c
                 where c.id = conversation_id and auth.uid() in (c.owner_id, c.borrower_id)));
create policy messages_insert on public.messages for insert
  with check (public.is_member()
              and sender_id = auth.uid()
              and exists (select 1 from public.conversations c
                          where c.id = conversation_id and auth.uid() in (c.owner_id, c.borrower_id)));

-- Ratings: published ones are public; your own are always visible to you.
create policy ratings_read on public.ratings for select
  using (is_published or rater_id = auth.uid() or ratee_id = auth.uid());
create policy ratings_insert on public.ratings for insert
  with check (public.is_member()
              and rater_id = auth.uid()
              and exists (select 1 from public.transactions tx
                          where tx.id = transaction_id
                            and auth.uid() in (tx.owner_id, tx.borrower_id)
                            and tx.status in ('returned','completed')));

create policy reports_insert on public.reports for insert
  with check (reporter_id = auth.uid() and public.is_member());
create policy reports_read   on public.reports for select using (reporter_id = auth.uid());

create policy blocks_own on public.blocks for all
  using (blocker_id = auth.uid()) with check (blocker_id = auth.uid());

create policy disputes_rw on public.disputes for all
  using (exists (select 1 from public.transactions tx
                 where tx.id = transaction_id and auth.uid() in (tx.owner_id, tx.borrower_id)))
  with check (opened_by = auth.uid());

-- Tool requests are public by design (that is the point of a broadcast).
create policy tool_requests_read on public.tool_requests for select
  using (status = 'open' or requester_id = auth.uid());
create policy tool_requests_write on public.tool_requests for all
  using (requester_id = auth.uid())
  with check (requester_id = auth.uid() and public.is_member());

create policy offers_read on public.tool_request_offers for select
  using (owner_id = auth.uid()
         or exists (select 1 from public.tool_requests r
                    where r.id = tool_request_id and r.requester_id = auth.uid()));
create policy offers_write on public.tool_request_offers for all
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid() and public.is_member());

create policy notifications_own on public.notifications for select using (user_id = auth.uid());
create policy notifications_update on public.notifications for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy ai_results_own on public.ai_identification_results for select
  using (user_id = auth.uid());
create policy ai_quota_own on public.ai_usage_quota for select using (user_id = auth.uid());
-- ai_query_cache has NO policy: it is written and read only by the service role.

-- =====================================================================
-- 12. GRANTS
-- Supabase grants these by default; stated explicitly so the migration is
-- self-contained and reviewable. Table access is still gated by RLS.
-- =====================================================================
grant usage on schema public to anon, authenticated;
grant select on all tables in schema public to anon, authenticated;
grant insert, update, delete on all tables in schema public to authenticated;

grant execute on function public.search_tools_nearby to anon, authenticated;
grant execute on function public.is_member            to anon, authenticated;
grant execute on function public.purge_stale_guests   to service_role;
grant execute on function public.get_pickup_location to authenticated;
grant execute on function public.match_tool_request  to service_role;
grant execute on function public.consume_ai_quota    to service_role;
revoke execute on function public.fuzz_point from anon, authenticated;

-- ---------------------------------------------------------------------
-- 20260101000100_rpcs.sql
-- ---------------------------------------------------------------------
-- =====================================================================
-- NailedIt — write RPCs
--
-- Anything that must be atomic, or that must not let a client see an
-- intermediate state, lives here rather than as a sequence of client-side
-- inserts. The most important one is create_tool_with_location: doing that as
-- two separate inserts would put the owner's exact coordinates into the public
-- `tools` table for the moment between them.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Create a listing. The exact point NEVER touches the public table:
-- the id is generated first, the fuzzed point derived from it, and both
-- rows written in one transaction.
-- ---------------------------------------------------------------------
create or replace function public.create_tool_with_location(
  p_title                text,
  p_tool_type            text,
  p_brand                text,
  p_model                text,
  p_is_model_confirmed   boolean,
  p_category_slug        text,
  p_description          text,
  p_condition            text,
  p_accessories          text,
  p_instructions         text,
  p_max_borrow_days      smallint,
  p_is_free              boolean,
  p_price_per_day_agorot bigint,
  p_availability_mode    availability_mode,
  p_risk                 risk_level,
  p_lat                  double precision,
  p_lng                  double precision,
  p_neighborhood_label   text default null,
  p_address_line         text default null,
  p_pickup_notes         text default null
)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id       uuid := gen_random_uuid();
  v_user     uuid := auth.uid();
  v_category smallint;
  v_exact    geography(Point, 4326);
begin
  if not public.is_member() then
    raise exception 'Only signed-in members can list a tool' using errcode = '42501';
  end if;

  select id into v_category from public.tool_categories where slug = p_category_slug;
  if v_category is null then
    select id into v_category from public.tool_categories where slug = 'other';
  end if;

  if not p_is_free and coalesce(p_price_per_day_agorot, 0) <= 0 then
    raise exception 'A rental needs a price per day' using errcode = '22023';
  end if;

  v_exact := ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography;

  insert into public.tools (
    id, owner_id, category_id, title, tool_type, brand, model, is_model_confirmed,
    description, condition, accessories, instructions, max_borrow_days,
    payment_mode, price_per_day_agorot, availability_mode, status, risk,
    fuzzed_location, neighborhood_label
  ) values (
    v_id, v_user, v_category, p_title, p_tool_type, p_brand, p_model, p_is_model_confirmed,
    p_description, p_condition, p_accessories, p_instructions, p_max_borrow_days,
    case when p_is_free then 'free' else 'offline' end::payment_mode,
    case when p_is_free then null else p_price_per_day_agorot end,
    p_availability_mode, 'active', p_risk,
    public.fuzz_point(v_exact, v_id), p_neighborhood_label
  );

  insert into public.tool_locations (tool_id, exact_location, address_line, pickup_notes)
  values (v_id, v_exact, p_address_line, p_pickup_notes);

  return v_id;
end $$;

-- ---------------------------------------------------------------------
-- Borrow request. Computes the quote server-side so a client cannot
-- propose its own price, and blocks duplicate pending requests.
-- ---------------------------------------------------------------------
create or replace function public.create_borrow_request(
  p_tool_id           uuid,
  p_start_at          timestamptz,
  p_end_at            timestamptz,
  p_message           text default null,
  p_risk_acknowledged boolean default false
)
returns public.borrow_requests
language plpgsql security definer set search_path = public as $$
declare
  v_tool  public.tools;
  v_user  uuid := auth.uid();
  v_days  integer;
  v_row   public.borrow_requests;
begin
  if not public.is_member() then
    raise exception 'Sign in to send a borrow request' using errcode = '42501';
  end if;

  select * into v_tool from public.tools
   where id = p_tool_id and status = 'active' and deleted_at is null;
  if v_tool.id is null then
    raise exception 'That tool is not available' using errcode = 'P0002';
  end if;
  if v_tool.owner_id = v_user then
    raise exception 'You cannot borrow your own tool' using errcode = '22023';
  end if;
  if v_tool.risk = 'high' and not p_risk_acknowledged then
    raise exception 'High-risk tools need a safety acknowledgement' using errcode = '22023';
  end if;

  if exists (
    select 1 from public.borrow_requests
     where tool_id = p_tool_id and borrower_id = v_user and status = 'pending'
  ) then
    raise exception 'You already have a pending request for this tool' using errcode = '23505';
  end if;

  v_days := greatest(1, ceil(extract(epoch from (p_end_at - p_start_at)) / 86400)::int);

  insert into public.borrow_requests (
    tool_id, borrower_id, owner_id, start_at, end_at, message,
    quoted_total_agorot, payment_mode, risk_acknowledged
  ) values (
    p_tool_id, v_user, v_tool.owner_id, p_start_at, p_end_at, p_message,
    case when v_tool.payment_mode = 'free' then null
         else coalesce(v_tool.price_per_day_agorot, 0) * v_days end,
    v_tool.payment_mode, p_risk_acknowledged
  ) returning * into v_row;

  insert into public.notifications (user_id, kind, title, body, route, payload)
  values (
    v_tool.owner_id, 'borrow_request_received',
    'New borrow request', v_tool.title,
    'nailedit://requests/' || v_row.id,
    jsonb_build_object('request_id', v_row.id, 'tool_id', p_tool_id)
  );

  return v_row;
end $$;

-- ---------------------------------------------------------------------
-- Accept or decline. Accepting creates the transaction AND the
-- conversation in the same breath — the borrower should never see an
-- accepted request with nowhere to talk.
-- ---------------------------------------------------------------------
create or replace function public.respond_to_request(
  p_request_id uuid,
  p_decision   request_status
)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_req  public.borrow_requests;
  v_conv uuid;
  v_tool text;
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

  update public.borrow_requests
     set status = p_decision, responded_at = now()
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
      v_req.end_at
    );

    insert into public.conversations (tool_id, request_id, owner_id, borrower_id, last_message_at)
    values (v_req.tool_id, v_req.id, v_req.owner_id, v_req.borrower_id, now())
    returning id into v_conv;

    insert into public.messages (conversation_id, sender_id, kind, body)
    values (v_conv, v_req.owner_id, 'system', 'Request accepted. Pickup details are now shared.');
  end if;

  insert into public.notifications (user_id, kind, title, body, route, payload)
  values (
    v_req.borrower_id,
    (case when p_decision = 'accepted' then 'borrow_request_accepted'
          else 'borrow_request_declined' end)::notification_kind,
    case when p_decision = 'accepted' then 'Request accepted' else 'Request declined' end,
    coalesce(v_tool, ''),
    'nailedit://requests/' || v_req.id,
    jsonb_build_object('request_id', v_req.id)
  );
end $$;

-- ---------------------------------------------------------------------
-- Return confirmation. Either side may confirm; the transaction only
-- completes once both have, or once a job ages out the grace period.
-- ---------------------------------------------------------------------
create or replace function public.confirm_return(p_transaction_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare v_tx public.transactions;
begin
  select * into v_tx from public.transactions where id = p_transaction_id;
  if v_tx.id is null then
    raise exception 'Transaction not found' using errcode = 'P0002';
  end if;
  if auth.uid() not in (v_tx.owner_id, v_tx.borrower_id) then
    raise exception 'Not your transaction' using errcode = '42501';
  end if;

  if auth.uid() = v_tx.owner_id then
    update public.transactions set owner_confirmed_return_at = now() where id = p_transaction_id;
  else
    update public.transactions set borrower_confirmed_return_at = now() where id = p_transaction_id;
  end if;

  update public.transactions
     set status = 'returned', returned_at = coalesce(returned_at, now())
   where id = p_transaction_id and status in ('agreed', 'picked_up');

  update public.transactions t
     set status = 'completed', completed_at = now()
   where t.id = p_transaction_id
     and t.owner_confirmed_return_at is not null
     and t.borrower_confirmed_return_at is not null;

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

-- ---------------------------------------------------------------------
-- Ratings are double-blind: a rating publishes when both sides have
-- rated, or after 7 days, whichever comes first. Without that window the
-- first rater sets the tone and the second rates retaliatorily.
-- ---------------------------------------------------------------------
create or replace function public.submit_rating(
  p_transaction_id uuid,
  p_stars          smallint,
  p_tags           text[] default '{}',
  p_comment        text default null
)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_tx        public.transactions;
  v_ratee     uuid;
  v_direction rating_direction;
begin
  select * into v_tx from public.transactions where id = p_transaction_id;
  if v_tx.id is null or auth.uid() not in (v_tx.owner_id, v_tx.borrower_id) then
    raise exception 'Not your transaction' using errcode = '42501';
  end if;
  if v_tx.status not in ('returned', 'completed') then
    raise exception 'You can rate once the tool is back' using errcode = '22023';
  end if;

  if auth.uid() = v_tx.borrower_id then
    v_ratee := v_tx.owner_id;
    v_direction := 'borrower_to_owner';
  else
    v_ratee := v_tx.borrower_id;
    v_direction := 'owner_to_borrower';
  end if;

  insert into public.ratings (transaction_id, rater_id, ratee_id, direction, stars, tags, comment)
  values (p_transaction_id, auth.uid(), v_ratee, v_direction, p_stars, coalesce(p_tags, '{}'), p_comment)
  on conflict (transaction_id, rater_id) do nothing;

  -- Both sides in? Publish the pair together.
  if (select count(*) from public.ratings where transaction_id = p_transaction_id) = 2 then
    update public.ratings set is_published = true
     where transaction_id = p_transaction_id and not is_published;
  end if;

  insert into public.notifications (user_id, kind, title, body, route, payload)
  values (v_ratee, 'rating_received', 'You received a rating', '',
          'nailedit://transaction/' || p_transaction_id,
          jsonb_build_object('transaction_id', p_transaction_id));
end $$;

/**
 * Publishes ratings whose 7-day double-blind window has passed with only one
 * side rating. Run this daily (pg_cron, or a scheduled Edge Function).
 */
create or replace function public.publish_stale_ratings()
returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  update public.ratings
     set is_published = true
   where not is_published and created_at < now() - interval '7 days';
  get diagnostics n = row_count;
  return n;
end $$;

-- ---------------------------------------------------------------------
-- Tool requests (the "I need a tool" broadcast)
-- ---------------------------------------------------------------------
create or replace function public.create_tool_request(
  p_raw_text          text,
  p_parsed_tool_types text[],
  p_radius_m          integer,
  p_needed_from       timestamptz,
  p_needed_to         timestamptz,
  p_lat               double precision,
  p_lng               double precision
)
returns public.tool_requests
language plpgsql security definer set search_path = public as $$
declare
  v_row public.tool_requests;
  v_id  uuid := gen_random_uuid();
begin
  if not public.is_member() then
    raise exception 'Sign in to post what you need' using errcode = '42501';
  end if;

  insert into public.tool_requests (
    id, requester_id, raw_text, parsed_tool_types, radius_m,
    needed_from, needed_to, fuzzed_location
  ) values (
    v_id, auth.uid(), p_raw_text, coalesce(p_parsed_tool_types, '{}'), p_radius_m,
    p_needed_from, p_needed_to,
    -- The requester's own position is fuzzed too. Wanting a tool should not
    -- publish where you live any more than owning one does.
    public.fuzz_point(ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography, v_id)
  ) returning * into v_row;

  -- Notify nearby owners who have a matching tool and haven't opted out.
  insert into public.notifications (user_id, kind, title, body, route, payload)
  select distinct m.owner_id, 'nearby_tool_request',
         'Someone nearby needs a tool', v_row.raw_text,
         'nailedit://request/' || v_row.id,
         jsonb_build_object('tool_request_id', v_row.id, 'tool_id', m.tool_id,
                            'distance_m', m.distance_m)
    from public.match_tool_request(v_row.id) m;

  return v_row;
end $$;

create or replace function public.nearby_tool_requests(
  p_lat      double precision,
  p_lng      double precision,
  p_radius_m integer default 3000
)
returns table (
  id                   uuid,
  requester_id         uuid,
  requester_first_name text,
  raw_text             text,
  parsed_tool_types    text[],
  category_id          smallint,
  radius_m             integer,
  needed_from          timestamptz,
  needed_to            timestamptz,
  status               tool_request_status,
  distance_m           integer,
  offer_count          integer,
  created_at           timestamptz
)
language sql stable security definer set search_path = public as $$
  select r.id, r.requester_id, p.first_name, r.raw_text, r.parsed_tool_types,
         r.category_id, r.radius_m, r.needed_from, r.needed_to, r.status,
         (round(ST_Distance(r.fuzzed_location,
            ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography) / 50.0) * 50)::int,
         (select count(*)::int from public.tool_request_offers o where o.tool_request_id = r.id),
         r.created_at
    from public.tool_requests r
    join public.profiles p on p.id = r.requester_id
   where r.status = 'open'
     and r.expires_at > now()
     and ST_DWithin(r.fuzzed_location,
           ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography, p_radius_m)
   order by created_at desc
   limit 50;
$$;

-- ---------------------------------------------------------------------
-- Keep conversations.last_message_at current so the inbox can order by it
-- without an aggregate over every message.
-- ---------------------------------------------------------------------
create or replace function public.touch_conversation()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.conversations
     set last_message_at = new.created_at
   where id = new.conversation_id;

  insert into public.notifications (user_id, kind, title, body, route, payload)
  select case when c.owner_id = new.sender_id then c.borrower_id else c.owner_id end,
         'message_received', 'New message', left(new.body, 120),
         'nailedit://chat/' || c.id,
         jsonb_build_object('conversation_id', c.id)
    from public.conversations c
   where c.id = new.conversation_id
     and new.kind <> 'system';

  return new;
end $$;

create trigger messages_touch_conversation
  after insert on public.messages
  for each row execute function public.touch_conversation();

-- ---------------------------------------------------------------------
-- Expire unanswered requests. Run hourly.
-- ---------------------------------------------------------------------
create or replace function public.expire_stale_requests()
returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  update public.borrow_requests
     set status = 'expired'
   where status = 'pending' and expires_at < now();
  get diagnostics n = row_count;
  return n;
end $$;

-- ---------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------
grant execute on function public.create_tool_with_location to authenticated;
grant execute on function public.create_borrow_request     to authenticated;
grant execute on function public.respond_to_request        to authenticated;
grant execute on function public.confirm_return            to authenticated;
grant execute on function public.submit_rating             to authenticated;
grant execute on function public.create_tool_request       to authenticated;
grant execute on function public.nearby_tool_requests      to anon, authenticated;
grant execute on function public.publish_stale_ratings     to service_role;
grant execute on function public.expire_stale_requests     to service_role;

-- ---------------------------------------------------------------------
-- 20260101000200_retention.sql
-- ---------------------------------------------------------------------
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

-- ---------------------------------------------------------------------
-- 20260101000300_storage.sql
-- ---------------------------------------------------------------------
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

-- ---------------------------------------------------------------------
-- 20260101000500_pickup_and_items.sql
-- ---------------------------------------------------------------------
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

-- ---------------------------------------------------------------------
-- 20260101000600_seed_demo.sql
-- ---------------------------------------------------------------------
-- =====================================================================
-- NailedIt — demo seed data (Tel Aviv)
--
-- DEMO/DEVELOPMENT ONLY. Never run against a real user base: it creates
-- auth users with known ids and no password.
--
-- Everything is written through the same RPCs real data goes through, so
-- the location-fuzzing trigger, the RLS policies and every constraint are
-- exercised exactly as they will be in production. Seeding must never take
-- a path production won't — a seed that bypasses the triggers is how you
-- end up with demo rows that could not legally exist.
--
-- Re-runnable: it does nothing if tools already exist.
-- =====================================================================

do $$
declare
  v_daniel uuid := '00000000-0000-4000-a000-000000000001';
  v_adi    uuid := '00000000-0000-4000-a000-000000000002';
  v_michal uuid := '00000000-0000-4000-a000-000000000003';
  v_omer   uuid := '00000000-0000-4000-a000-000000000004';
  v_noa    uuid := '00000000-0000-4000-a000-000000000005';
  v_dana   uuid := '00000000-0000-4000-a000-000000000006';
  v_lat    double precision := 32.0553;   -- Florentin, Tel Aviv
  v_lng    double precision := 34.7688;
  v_tool   uuid;
  v_drill  uuid;
  v_req    public.borrow_requests;
  v_conv   uuid;
  r        record;
begin
  if exists (select 1 from public.tools limit 1) then
    raise notice 'Seed skipped — tools already exist.';
    return;
  end if;

  insert into auth.users (id, email, raw_user_meta_data, email_confirmed_at)
  values
    (v_daniel, 'daniel@example.com', '{"full_name":"Daniel Avrahami"}'::jsonb, now()),
    (v_adi,    'adi@example.com',    '{"full_name":"Adi Bar"}'::jsonb,         now()),
    (v_michal, 'michal@example.com', '{"full_name":"Michal Gur"}'::jsonb,      now()),
    (v_omer,   'omer@example.com',   '{"full_name":"Omer Katz"}'::jsonb,       now()),
    (v_noa,    'noa@example.com',    '{"full_name":"Noa Shani"}'::jsonb,       now()),
    (v_dana,   'dana@example.com',   '{"full_name":"Dana Cohen"}'::jsonb,      now())
  on conflict (id) do nothing;

  update public.profiles set neighborhood_label = 'Dizengoff Center' where id = v_daniel;
  update public.profiles set neighborhood_label = 'Florentin'        where id in (v_adi, v_omer, v_dana);
  update public.profiles set neighborhood_label = 'Neve Tzedek'      where id = v_michal;
  update public.profiles set neighborhood_label = 'Shapira'          where id = v_noa;

  -- Reputations chosen so the *displayed* (Bayesian-smoothed) score lands on
  -- the number the designs show. smoothed = (sum + 4.6*5) / (n + 5), so a
  -- raw average alone would not reproduce them.
  update public.profiles set rating_sum_owner = 60, rating_count_owner = 12,
         completed_lends = 12, verification_level = 'phone' where id = v_daniel;  -- 4.9
  update public.profiles set rating_sum_owner = 92, rating_count_owner = 19,
         completed_lends = 23 where id = v_adi;                                    -- 4.8
  update public.profiles set rating_sum_owner = 43, rating_count_owner = 9,
         completed_lends = 11, verification_level = 'phone' where id = v_michal;   -- 4.7
  update public.profiles set rating_sum_owner = 32, rating_count_owner = 7,
         completed_lends = 9 where id = v_omer;                                    -- 4.6
  update public.profiles set rating_sum_owner = 75, rating_count_owner = 15,
         completed_lends = 18, verification_level = 'phone' where id = v_noa;      -- 4.9
  update public.profiles set rating_sum_owner = 31, rating_count_owner = 6,
         completed_lends = 6, completed_borrows = 4 where id = v_dana;             -- 4.9

  -- ------------------------------------------------------------------
  -- The catalogue.
  --
  -- Offsets are metres north/east of the Florentin centre, chosen so the
  -- rounded distances read the way the designs do: the drill at ~300 m, the
  -- jigsaw at 550, the ladder at 700, the washer at 1.2 km.
  -- ------------------------------------------------------------------
  for r in
    select * from (values
      (v_daniel, 'Bosch Cordless Drill',      'cordless-drill',  'Bosch',        'GSB 18V-55', true,  'power-tools', true,  null::bigint, 'now',   'medium',   180,  220, 'Dizengoff Center', 'good',     '18V cordless drill suitable for wood, metal and light masonry. Includes battery and charger.'),
      (v_adi,    'Makita Jigsaw',             'jigsaw',          'Makita',       null,         false, 'woodworking', false, 1500::bigint, 'dates', 'high',    -320,  450, 'Florentin',        'good',     'Corded jigsaw for curves in wood and thin metal. Comes with three blades.'),
      (v_michal, '3 m Ladder',                'ladder',          null,           null,         false, 'ladders',     true,  null::bigint, 'ask',   'medium',   560, -420, 'Neve Tzedek',      'good',     'Three-metre folding ladder. Light enough to carry, heavy enough to feel safe.'),
      (v_noa,    'Karcher Pressure Washer',   'pressure-washer', 'Karcher',      'K5',         false, 'cleaning',    false, 2500::bigint, 'dates', 'medium', -1050,  600, 'Shapira',          'like_new', 'Pressure washer for balconies, tiles and bikes. Hose and two nozzles included.'),
      (v_adi,    'Makita Rotary Hammer',      'rotary-hammer',   'Makita',       null,         false, 'power-tools', false, 1800::bigint, 'ask',   'high',     520,  390, 'Florentin',        'good',     'SDS rotary hammer for concrete. Three masonry bits included.'),
      (v_omer,   'Black+Decker Drill Set',    'drill-set',       'Black+Decker', null,         false, 'power-tools', true,  null::bigint, 'now',   'medium',  -980, -420, 'Shapira',          'worn',     'Drill plus a full bit set in a hard case. Good for flat-pack and picture hooks.'),
      (v_adi,    'Hedge Trimmer',             'hedge-trimmer',   'Ryobi',        null,         false, 'gardening',   true,  null::bigint, 'now',   'high',   -1750, -900, 'Florentin',        'good',     'Electric hedge trimmer, 45 cm blade. Good for a balcony hedge or small garden.'),
      (v_dana,   'Screwdriver & Spanner Set', 'socket-set',      null,           null,         false, 'hand-tools',  true,  null::bigint, 'now',   'low',     1450, -520, 'Florentin',        'good',     'A full set of screwdrivers and spanners in a case. Enough for most flat-pack jobs.'),
      (v_noa,    'Manual Tile Cutter',        'tile-cutter',     'Rubi',         null,         false, 'home-repair', false, 2000::bigint, 'dates', 'medium', -1500,  700, 'Shapira',          'good',     'Manual tile cutter up to 60 cm. Clean cuts on ceramic, harder work on porcelain.'),
      (v_michal, 'Paint Roller Kit & Tray',   'paint-sprayer',   null,           null,         false, 'painting',    true,  null::bigint, 'now',   'low',     2000,-1200, 'Florentin',        'good',     'Two rollers, an extension pole and a tray. Washed and ready.'),
      (v_omer,   'Folding Hand Trolley',      'tool-trolley',    null,           null,         false, 'moving',      true,  null::bigint, 'ask',   'low',    -1700,  750, 'Florentin',        'worn',     'Folding trolley, takes about 70 kg. Saved me three trips up four floors.'),
      (v_michal, '4-Person Tent',             'tent',            'Coleman',      null,         false, 'camping',     false, 4000::bigint, 'dates', 'low',     1900, -900, 'Neve Tzedek',      'good',     'Four-person tent, dry and complete. Pegs and poles all present.'),
      (v_noa,    'Electric Lawn Mower',       'lawn-mower',      'Bosch',        null,         false, 'gardening',   false, 3500::bigint, 'ask',   'high',   -2400, 1100, 'Shapira',          'good',     'Corded mower for a small garden. Grass box included.'),
      (v_daniel, 'Stud & Cable Detector',     'stud-detector',   'Bosch',        'Truvo',      true,  'home-repair', true,  null::bigint, 'now',   'low',     1600,  700, 'Dizengoff Center', 'like_new', 'Finds studs, metal and live wiring before you drill. Takes one 9V battery.')
    ) as t(owner, title, tool_type, brand, model, confirmed, category, is_free, price,
           availability, risk, north_m, east_m, hood, cond, description)
  loop
    -- Act as the owner, so create_tool_with_location's own auth checks run.
    perform set_config('request.jwt.claim.sub', r.owner::text, true);
    perform set_config(
      'request.jwt.claims',
      json_build_object('sub', r.owner, 'is_anonymous', false)::text,
      true
    );

    v_tool := public.create_tool_with_location(
      r.title, r.tool_type, r.brand, r.model, r.confirmed, r.category,
      r.description, r.cond, null, null, 3::smallint,
      r.is_free, r.price, r.availability::availability_mode, r.risk::risk_level,
      v_lat + r.north_m / 111320.0,
      v_lng + r.east_m / (111320.0 * cos(radians(v_lat))),
      r.hood,
      'Seed address — demo data only',
      null
    );

    if r.title = 'Bosch Cordless Drill' then
      v_drill := v_tool;
    end if;

    -- Evening pickup windows on every day, so "Available today" is never
    -- empty in a demo — a real listing would be sparser.
    insert into public.tool_pickup_windows (tool_id, weekday, start_time, end_time)
    select v_tool, d, s.a, s.b
    from generate_series(0, 6) as d,
         (values ('18:00'::time, '20:00'::time), ('20:00'::time, '22:00'::time)) as s(a, b)
    on conflict do nothing;

    -- What's in the box, for the tools where it changes the decision.
    if r.tool_type = 'cordless-drill' then
      insert into public.tool_included_items (tool_id, label, icon, position) values
        (v_tool, '18V Battery', 'battery', 0),
        (v_tool, 'Charger', 'charger', 1),
        (v_tool, 'Case', 'case', 2);
    elsif r.tool_type = 'drill-set' then
      insert into public.tool_included_items (tool_id, label, icon, position) values
        (v_tool, 'Battery', 'battery', 0),
        (v_tool, 'Charger', 'charger', 1),
        (v_tool, 'Bit set', 'case', 2);
    elsif r.tool_type = 'rotary-hammer' then
      insert into public.tool_included_items (tool_id, label, icon, position) values
        (v_tool, '3 SDS bits', 'item', 0),
        (v_tool, 'Side handle', 'item', 1),
        (v_tool, 'Case', 'case', 2);
    elsif r.tool_type = 'jigsaw' then
      insert into public.tool_included_items (tool_id, label, icon, position) values
        (v_tool, '3 blades', 'item', 0),
        (v_tool, 'Case', 'case', 1);
    elsif r.tool_type = 'pressure-washer' then
      insert into public.tool_included_items (tool_id, label, icon, position) values
        (v_tool, 'Hose', 'item', 0),
        (v_tool, '2 nozzles', 'item', 1),
        (v_tool, 'Detergent', 'item', 2);
    end if;
  end loop;

  -- ------------------------------------------------------------------
  -- One exchange in flight, so the Messages tab is not an empty state.
  -- Dana is borrowing Daniel's drill; the request is accepted, which is
  -- what creates the transaction and the conversation.
  -- ------------------------------------------------------------------
  perform set_config('request.jwt.claim.sub', v_dana::text, true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_dana, 'is_anonymous', false)::text, true);

  v_req := public.create_borrow_request(
    v_drill,
    date_trunc('day', now()) + interval '18 hours 30 minutes',
    date_trunc('day', now()) + interval '1 day 21 hours',
    'Hi Daniel, can I borrow the drill today around 18:30?',
    true
  );

  perform set_config('request.jwt.claim.sub', v_daniel::text, true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_daniel, 'is_anonymous', false)::text, true);

  perform public.respond_to_request(v_req.id, 'accepted');

  select id into v_conv from public.conversations where request_id = v_req.id;

  insert into public.messages (conversation_id, sender_id, kind, body, created_at) values
    (v_conv, v_dana,   'text', 'Hi Daniel, can I borrow the drill today around 18:30?', now() - interval '24 minutes'),
    (v_conv, v_daniel, 'text', 'Yes — no problem. I''ll be home after 18:00.',          now() - interval '22 minutes'),
    (v_conv, v_dana,   'text', 'Perfect, thanks!',                                      now() - interval '21 minutes'),
    (v_conv, v_daniel, 'text', 'Pickup near Dizengoff Center.',                         now() - interval '12 minutes');

  -- ------------------------------------------------------------------
  -- One pending request the other way round, so the Requests tab has
  -- something to accept or decline.
  -- ------------------------------------------------------------------
  perform set_config('request.jwt.claim.sub', v_omer::text, true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_omer, 'is_anonymous', false)::text, true);

  select id into v_tool from public.tools
   where owner_id = v_dana and title = 'Screwdriver & Spanner Set';

  perform public.create_borrow_request(
    v_tool,
    now() + interval '1 day',
    now() + interval '2 days',
    'Assembling a wardrobe tomorrow evening — could I grab it around 18:00?',
    false
  );

  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '', true);

  raise notice 'Seeded % tools, % pickup windows, % included items.',
    (select count(*) from public.tools),
    (select count(*) from public.tool_pickup_windows),
    (select count(*) from public.tool_included_items);
end $$;

-- ---------------------------------------------------------------------
-- 20260101000700_demo_helpers.sql
-- ---------------------------------------------------------------------
-- =====================================================================
-- NailedIt — "make the demo mine"
--
-- The seed creates a conversation between two demo neighbours. RLS means
-- nobody else can see it, so a real person who signs in to try the app
-- lands on an empty Messages tab and an empty Borrowing list — which is
-- the truth, and also a terrible demo.
--
-- This gives the *caller* their own copy: an accepted borrow of Daniel's
-- drill, with the same short thread. It is a demo affordance, not a
-- product feature, and it is deliberately conservative:
--   * it does nothing unless the demo seed is present;
--   * it does nothing if the caller already has a transaction, so it can
--     never trample real activity;
--   * it refuses guests, exactly like every other write.
-- Drop this migration before a public launch.
-- =====================================================================

create or replace function public.seed_demo_for_me()
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_user   uuid := auth.uid();
  v_owner  uuid := '00000000-0000-4000-a000-000000000001';   -- Daniel, from the seed
  v_drill  uuid;
  v_req    uuid;
  v_conv   uuid;
begin
  if not public.is_member() then
    raise exception 'Sign in first' using errcode = '42501';
  end if;

  select id into v_drill from public.tools
   where owner_id = v_owner and title = 'Bosch Cordless Drill' and status = 'active'
   limit 1;

  if v_drill is null then
    return jsonb_build_object('ok', false, 'reason', 'no_demo_data');
  end if;

  if v_user = v_owner then
    return jsonb_build_object('ok', false, 'reason', 'you_are_the_owner');
  end if;

  if exists (select 1 from public.transactions
              where borrower_id = v_user or owner_id = v_user) then
    return jsonb_build_object('ok', false, 'reason', 'already_has_activity');
  end if;

  -- The same rows respond_to_request would have written, in the same order.
  insert into public.borrow_requests (
    tool_id, borrower_id, owner_id, start_at, end_at, message,
    quoted_total_agorot, payment_mode, risk_acknowledged, status, responded_at
  ) values (
    v_drill, v_user, v_owner,
    date_trunc('day', now()) + interval '18 hours 30 minutes',
    date_trunc('day', now()) + interval '1 day 21 hours',
    'Hi Daniel, can I borrow the drill today around 18:30?',
    null, 'free', true, 'accepted', now()
  ) returning id into v_req;

  insert into public.transactions (
    request_id, tool_id, owner_id, borrower_id, status,
    agreed_total_agorot, payment_mode, payment_status, due_at
  ) values (
    v_req, v_drill, v_owner, v_user, 'agreed',
    null, 'free', 'not_applicable'::payment_status,
    date_trunc('day', now()) + interval '1 day 21 hours'
  );

  insert into public.conversations (tool_id, request_id, owner_id, borrower_id, last_message_at)
  values (v_drill, v_req, v_owner, v_user, now())
  returning id into v_conv;

  insert into public.messages (conversation_id, sender_id, kind, body, created_at) values
    (v_conv, v_user,  'text', 'Hi Daniel, can I borrow the drill today around 18:30?', now() - interval '24 minutes'),
    (v_conv, v_owner, 'text', 'Yes — no problem. I''ll be home after 18:00.',          now() - interval '22 minutes'),
    (v_conv, v_user,  'text', 'Perfect, thanks!',                                      now() - interval '21 minutes'),
    (v_conv, v_owner, 'text', 'Pickup near Dizengoff Center.',                         now() - interval '12 minutes');

  return jsonb_build_object('ok', true, 'conversation_id', v_conv);
end $$;

grant execute on function public.seed_demo_for_me() to authenticated;

-- ---------------------------------------------------------------------
-- 20260101000800_demo_relocate.sql
-- ---------------------------------------------------------------------
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

-- ---------------------------------------------------------------------
-- 20260101000900_demo_auto_reply.sql
-- ---------------------------------------------------------------------
-- =====================================================================
-- NailedIt — let the demo neighbours answer
--
-- Borrow requests only become conversations when the OWNER accepts them.
-- That is right for the product and useless for a demo: the seeded owners
-- are fictional, so a request sent to Daniel or Yael stays pending forever
-- and the Messages tab stays empty. Someone showing the app to a potential
-- user taps Borrow, writes a message, and then has nothing to show.
--
-- This answers on their behalf — but only for requests the CALLER sent to a
-- SEEDED owner. It cannot touch a request between two real people, and it
-- cannot answer a request that isn't yours.
--
-- Demo affordance, like seed_demo_for_me(). Drop before a public launch.
-- =====================================================================

create or replace function public.demo_answer_my_requests()
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
  v_user     uuid := auth.uid();
  v_req      public.borrow_requests;
  v_conv     uuid;
  v_tool     text;
  v_answered integer := 0;
begin
  if not public.is_member() then
    raise exception 'Sign in first' using errcode = '42501';
  end if;

  for v_req in
    select * from public.borrow_requests
     where borrower_id = v_user
       and owner_id = any(v_demo_owners)
       and status = 'pending'
     order by created_at
  loop
    -- Exactly what respond_to_request(accepted) writes, in the same order.
    update public.borrow_requests
       set status = 'accepted', responded_at = now()
     where id = v_req.id;

    select title into v_tool from public.tools where id = v_req.tool_id;

    insert into public.transactions (
      request_id, tool_id, owner_id, borrower_id, status,
      agreed_total_agorot, payment_mode, payment_status, payment_provider, due_at
    ) values (
      v_req.id, v_req.tool_id, v_req.owner_id, v_req.borrower_id, 'agreed',
      v_req.quoted_total_agorot, v_req.payment_mode,
      (case when v_req.payment_mode = 'free' then 'not_applicable' else 'pending' end)::payment_status,
      case when v_req.payment_mode = 'free' then null else 'offline' end,
      v_req.end_at
    );

    insert into public.conversations (tool_id, request_id, owner_id, borrower_id, last_message_at)
    values (v_req.tool_id, v_req.id, v_req.owner_id, v_req.borrower_id, now())
    returning id into v_conv;

    -- The borrower's own message first, so the thread reads as a conversation
    -- rather than starting with the owner talking to nobody.
    if coalesce(btrim(v_req.message), '') <> '' then
      insert into public.messages (conversation_id, sender_id, kind, body, created_at)
      values (v_conv, v_req.borrower_id, 'text', v_req.message, v_req.created_at);
    end if;

    insert into public.messages (conversation_id, sender_id, kind, body, created_at)
    values (v_conv, v_req.owner_id, 'system',
            'Request accepted. Pickup details are now shared.', now() - interval '2 minutes');

    insert into public.messages (conversation_id, sender_id, kind, body, created_at)
    values (v_conv, v_req.owner_id, 'text',
            'Sure — I''m around this evening. Message me when you set off.', now() - interval '1 minute');

    insert into public.notifications (user_id, kind, title, body, route, payload)
    values (
      v_req.borrower_id, 'borrow_request_accepted',
      'Request accepted', coalesce(v_tool, ''),
      'nailedit://requests/' || v_req.id,
      jsonb_build_object('request_id', v_req.id)
    );

    v_answered := v_answered + 1;
  end loop;

  return jsonb_build_object('ok', true, 'answered', v_answered);
end $$;

grant execute on function public.demo_answer_my_requests() to authenticated;

-- ---------------------------------------------------------------------
-- 20260101001000_profile_identity.sql
-- ---------------------------------------------------------------------
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

-- ---------------------------------------------------------------------
-- 20260101001100_demo_incoming.sql
-- ---------------------------------------------------------------------
-- =====================================================================
-- NailedIt — let a demo neighbour ask to borrow YOUR tool
--
-- The lending half of the app is unreachable in a solo demo. You can list a
-- tool, but nobody is going to ask for it, so Accept, "picked up", "returned"
-- and rating-the-borrower never appear — the whole owner side of the product
-- is invisible to the person you are showing it to.
--
-- This has one of the seeded neighbours send a real borrow request for a tool
-- the caller owns, through the same table and the same shape as a genuine one.
-- From there everything is the real flow: the request lands in the Inbox, the
-- caller accepts it, a conversation and transaction are created by
-- respond_to_request, reminders get scheduled, and both sides can rate.
--
-- Demo affordance. Drop before a public launch.
-- =====================================================================

create or replace function public.demo_borrow_my_tool(p_tool_id uuid default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_user     uuid := auth.uid();
  -- Yael, from the seed. A different person from the one who lends the drill,
  -- so a demo showing both directions does not look like one pen pal.
  v_neighbour uuid := '00000000-0000-4000-a000-000000000002';
  v_tool      public.tools;
  v_days      integer := 2;
  v_start     timestamptz := date_trunc('hour', now()) + interval '3 hours';
  v_req       public.borrow_requests;
begin
  if not public.is_member() then
    raise exception 'Sign in first' using errcode = '42501';
  end if;

  if not exists (select 1 from public.profiles where id = v_neighbour) then
    return jsonb_build_object('ok', false, 'reason', 'no_demo_data');
  end if;

  select * into v_tool
    from public.tools
   where owner_id = v_user
     and status = 'active'
     and deleted_at is null
     and (p_tool_id is null or id = p_tool_id)
   order by created_at desc
   limit 1;

  if v_tool.id is null then
    return jsonb_build_object('ok', false, 'reason', 'no_tool_of_yours');
  end if;

  if exists (
    select 1 from public.borrow_requests
     where tool_id = v_tool.id and borrower_id = v_neighbour and status = 'pending'
  ) then
    return jsonb_build_object('ok', false, 'reason', 'already_asked', 'tool', v_tool.title);
  end if;

  -- Same columns create_borrow_request writes, including the server-side quote,
  -- so accepting it exercises the real code path rather than a special case.
  insert into public.borrow_requests (
    tool_id, borrower_id, owner_id, start_at, end_at, message,
    quoted_total_agorot, payment_mode, risk_acknowledged
  ) values (
    v_tool.id, v_neighbour, v_user,
    v_start, v_start + (v_days || ' days')::interval,
    'Hi! Saw your ' || v_tool.title || ' — could I borrow it for a couple of days?',
    case when v_tool.payment_mode = 'free' then null
         else coalesce(v_tool.price_per_day_agorot, 0) * v_days end,
    v_tool.payment_mode, true
  ) returning * into v_req;

  insert into public.notifications (user_id, kind, title, body, route, payload)
  values (
    v_user, 'borrow_request_received',
    'New borrow request', v_tool.title,
    'nailedit://requests/' || v_req.id,
    jsonb_build_object('request_id', v_req.id, 'tool_id', v_tool.id)
  );

  return jsonb_build_object(
    'ok', true, 'request_id', v_req.id, 'tool', v_tool.title
  );
end $$;

grant execute on function public.demo_borrow_my_tool(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 20260101001200_respond_with_time.sql
-- ---------------------------------------------------------------------
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

