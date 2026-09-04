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
