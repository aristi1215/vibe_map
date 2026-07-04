-- ============================================================
-- Life City Awareness — Initial Schema
-- Migration: 001_initial_schema.sql
--
-- Prerequisites (enable in Supabase dashboard first):
--   Dashboard > Database > Extensions > enable "vector" and "postgis"
-- ============================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS postgis;

-- ============================================================
-- ENUMS
-- ============================================================

CREATE TYPE mood_type AS ENUM (
  'social', 'calm', 'active', 'cultural',
  'romantic', 'productive', 'explorer', 'family'
);

CREATE TYPE busyness_level AS ENUM (
  'empty', 'calm', 'moderate', 'busy', 'very_busy'
);

CREATE TYPE busyness_source AS ENUM (
  'crowdsourced', 'scraped', 'insufficient_data'
);

CREATE TYPE share_type AS ENUM (
  'im_here', 'intent_to_go'
);

CREATE TYPE friendship_status AS ENUM (
  'pending', 'accepted', 'blocked'
);

CREATE TYPE circuit_breaker_status AS ENUM (
  'closed', 'open', 'half_open'
);

CREATE TYPE event_source AS ENUM (
  'first_party', 'partner_feed'
);

-- ============================================================
-- TABLES
-- ============================================================

-- User
-- Note: clerk_id links to the Clerk user; id is our internal pk
CREATE TABLE "user" (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clerk_id                TEXT UNIQUE NOT NULL,
  email                   TEXT UNIQUE NOT NULL,
  name                    TEXT NOT NULL,
  base_preference_vector  vector(3072),
  onboarding_completed_at TIMESTAMPTZ,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- InterestVocabulary — fixed first-party tag vocabulary, embedded once
CREATE TABLE interest_vocabulary (
  tag        TEXT PRIMARY KEY,
  vector     vector(3072) NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- UserInterest — user's selected tags from InterestVocabulary
CREATE TABLE user_interest (
  id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  tag     TEXT NOT NULL REFERENCES interest_vocabulary(tag) ON DELETE RESTRICT,
  weight  FLOAT NOT NULL DEFAULT 1.0,
  UNIQUE (user_id, tag)
);

-- CategoryVibePrior — authored vibe descriptor per category, embedded once
CREATE TABLE category_vibe_prior (
  category_key TEXT PRIMARY KEY,
  descriptor   TEXT NOT NULL,
  vector       vector(3072) NOT NULL,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- UserPreferenceVector — per-(user, mood) learned preference vector
CREATE TABLE user_preference_vector (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  mood_type      mood_type NOT NULL,
  vector         vector(3072) NOT NULL,
  evidence_count INT NOT NULL DEFAULT 0,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, mood_type)
);

-- MoodSession
CREATE TABLE mood_session (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  mood_type  mood_type NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at   TIMESTAMPTZ
);

-- Place — first-party skeleton only; no Google content stored
-- NOT STORED: name, category, opening_hours, rating, price_level, reviews
CREATE TABLE place (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  google_place_id           TEXT UNIQUE NOT NULL,
  last_known_lat            DOUBLE PRECISION,
  last_known_lng            DOUBLE PRECISION,
  coords_cached_at          TIMESTAMPTZ,
  behavioral_vector         vector(3072),
  behavioral_evidence_count INT NOT NULL DEFAULT 0,
  demand_signal             INT NOT NULL DEFAULT 0,
  last_signal_at            TIMESTAMPTZ,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Spatial index for geo queries (PostGIS)
CREATE INDEX place_coords_gist_idx
  ON place USING GIST (
    ST_SetSRID(ST_MakePoint(last_known_lng, last_known_lat), 4326)
  )
  WHERE last_known_lat IS NOT NULL AND last_known_lng IS NOT NULL;

-- PlaceBusyness — isolated high-churn busyness state
CREATE TABLE place_busyness (
  place_id               UUID PRIMARY KEY REFERENCES place(id) ON DELETE CASCADE,
  current_busyness_level busyness_level,
  busyness_source        busyness_source NOT NULL DEFAULT 'insufficient_data',
  unique_reporters_recent INT NOT NULL DEFAULT 0,
  busyness_computed_at   TIMESTAMPTZ,
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- GeoCacheZone — throttle scheduler for live Places API fetches
CREATE TABLE geo_cache_zone (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cell_id         TEXT UNIQUE NOT NULL,
  last_queried_at TIMESTAMPTZ,
  skeleton_count  INT NOT NULL DEFAULT 0
);

-- CrowdReport — user-submitted busyness reports
-- Anti-abuse: unique per (user_id, place_id, 15-min bucket)
-- time_bucket_15min is trigger-maintained rather than a GENERATED column because
-- date_trunc/EXTRACT on TIMESTAMPTZ are timezone-dependent (STABLE, not IMMUTABLE),
-- which Postgres disallows in GENERATED ALWAYS AS (...) STORED expressions.
CREATE TABLE crowd_report (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  place_id       UUID NOT NULL REFERENCES place(id) ON DELETE CASCADE,
  busyness_level busyness_level NOT NULL,
  reported_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  time_bucket_15min TIMESTAMPTZ NOT NULL,
  UNIQUE (user_id, place_id, time_bucket_15min)
);

CREATE OR REPLACE FUNCTION crowd_report_set_time_bucket()
RETURNS TRIGGER AS $$
BEGIN
  NEW.time_bucket_15min := date_trunc('hour', NEW.reported_at)
    + INTERVAL '15 min' * FLOOR(EXTRACT(MINUTE FROM NEW.reported_at) / 15);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_crowd_report_time_bucket
  BEFORE INSERT OR UPDATE OF reported_at ON crowd_report
  FOR EACH ROW EXECUTE FUNCTION crowd_report_set_time_bucket();

-- ScrapingBudget — daily budget + circuit breaker for busyness scraping
CREATE TABLE scraping_budget (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date                   DATE UNIQUE NOT NULL DEFAULT CURRENT_DATE,
  calls_made             INT NOT NULL DEFAULT 0,
  daily_limit            INT NOT NULL DEFAULT 50,
  circuit_breaker_status circuit_breaker_status NOT NULL DEFAULT 'closed'
);

-- Visit — user's post-visit feedback; drives both vectors
CREATE TABLE visit (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  place_id         UUID NOT NULL REFERENCES place(id) ON DELETE CASCADE,
  mood_at_visit    mood_type NOT NULL,
  visited_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  alignment_rating SMALLINT CHECK (alignment_rating BETWEEN 1 AND 5)
);

-- Recommendation — analytics log
CREATE TABLE recommendation (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  place_id        UUID NOT NULL REFERENCES place(id) ON DELETE CASCADE,
  mood_session_id UUID REFERENCES mood_session(id) ON DELETE SET NULL,
  score           FLOAT NOT NULL,
  shown_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  clicked         BOOLEAN NOT NULL DEFAULT false
);

-- Friendship — canonical pair (user_low_id < user_high_id by UUID ordering)
CREATE TABLE friendship (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_low_id  UUID NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  user_high_id UUID NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  requested_by UUID NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  status       friendship_status NOT NULL DEFAULT 'pending',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_low_id, user_high_id),
  CHECK (user_low_id < user_high_id)
);

-- LocationShare — live location share session
CREATE TABLE location_share (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  place_id        UUID REFERENCES place(id) ON DELETE SET NULL,
  share_type      share_type NOT NULL,
  last_known_lat  DOUBLE PRECISION,
  last_known_lng  DOUBLE PRECISION,
  last_ping_at    TIMESTAMPTZ,
  expires_at      TIMESTAMPTZ NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- LocationShareRecipient — normalized recipients for per-recipient revocation
CREATE TABLE location_share_recipient (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  share_id          UUID NOT NULL REFERENCES location_share(id) ON DELETE CASCADE,
  recipient_user_id UUID NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  revoked_at        TIMESTAMPTZ,
  UNIQUE (share_id, recipient_user_id)
);

-- ChatMessage — direct messages between friends
CREATE TABLE chat_message (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id   UUID NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  receiver_id UUID NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  content     TEXT NOT NULL,
  sent_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  read_at     TIMESTAMPTZ
);

-- Event
CREATE TABLE event (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  place_id     UUID REFERENCES place(id) ON DELETE SET NULL,
  title        TEXT NOT NULL,
  starts_at    TIMESTAMPTZ NOT NULL,
  ends_at      TIMESTAMPTZ,
  mood_tags    mood_type[] NOT NULL DEFAULT '{}',
  source       event_source NOT NULL DEFAULT 'first_party',
  external_ref TEXT
);

-- ============================================================
-- INDEXES
-- ============================================================

CREATE INDEX user_clerk_id_idx ON "user"(clerk_id);
CREATE INDEX user_interest_user_id_idx ON user_interest(user_id);
CREATE INDEX user_preference_vector_user_id_idx ON user_preference_vector(user_id);
CREATE INDEX mood_session_user_id_idx ON mood_session(user_id);
CREATE INDEX visit_user_id_idx ON visit(user_id);
CREATE INDEX visit_place_id_idx ON visit(place_id);
CREATE INDEX recommendation_user_id_idx ON recommendation(user_id);
CREATE INDEX recommendation_shown_at_idx ON recommendation(shown_at DESC);
CREATE INDEX crowd_report_place_id_idx ON crowd_report(place_id);
CREATE INDEX crowd_report_reported_at_idx ON crowd_report(reported_at DESC);
CREATE INDEX friendship_user_low_id_idx ON friendship(user_low_id);
CREATE INDEX friendship_user_high_id_idx ON friendship(user_high_id);
CREATE INDEX location_share_user_id_idx ON location_share(user_id);
CREATE INDEX location_share_expires_at_idx ON location_share(expires_at);
CREATE INDEX location_share_recipient_share_id_idx ON location_share_recipient(share_id);
CREATE INDEX chat_message_sender_id_idx ON chat_message(sender_id);
CREATE INDEX chat_message_receiver_id_idx ON chat_message(receiver_id);
CREATE INDEX chat_message_sent_at_idx ON chat_message(sent_at DESC);
CREATE INDEX event_starts_at_idx ON event(starts_at);

-- Vector similarity indexes intentionally omitted: pgvector's ivfflat/hnsw index
-- methods cap out at 2000 dimensions, but these columns are vector(3072) to match
-- text-embedding-3-large. Similarity queries will use exact (sequential-scan)
-- cosine distance until the embedding dimension is finalized (see build step 2),
-- at which point an ivfflat/hnsw index can be added for the chosen dimension.

-- ============================================================
-- ROW LEVEL SECURITY (stubs — policies to be filled in)
-- ============================================================

ALTER TABLE "user" ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_interest ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_preference_vector ENABLE ROW LEVEL SECURITY;
ALTER TABLE mood_session ENABLE ROW LEVEL SECURITY;
ALTER TABLE visit ENABLE ROW LEVEL SECURITY;
ALTER TABLE recommendation ENABLE ROW LEVEL SECURITY;
ALTER TABLE friendship ENABLE ROW LEVEL SECURITY;
ALTER TABLE location_share ENABLE ROW LEVEL SECURITY;
ALTER TABLE location_share_recipient ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_message ENABLE ROW LEVEL SECURITY;
ALTER TABLE crowd_report ENABLE ROW LEVEL SECURITY;

-- place, place_busyness, geo_cache_zone, interest_vocabulary,
-- category_vibe_prior, event, scraping_budget are read by service role only
ALTER TABLE place ENABLE ROW LEVEL SECURITY;
ALTER TABLE place_busyness ENABLE ROW LEVEL SECURITY;
ALTER TABLE geo_cache_zone ENABLE ROW LEVEL SECURITY;
ALTER TABLE interest_vocabulary ENABLE ROW LEVEL SECURITY;
ALTER TABLE category_vibe_prior ENABLE ROW LEVEL SECURITY;
ALTER TABLE event ENABLE ROW LEVEL SECURITY;
ALTER TABLE scraping_budget ENABLE ROW LEVEL SECURITY;

-- Stub policies — replace with real auth.uid() checks during implementation
-- Example (uncomment and adapt):
-- CREATE POLICY "users_own_row" ON "user"
--   FOR ALL USING (clerk_id = auth.jwt() ->> 'sub');
