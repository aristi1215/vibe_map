# Life City Awareness — Product & Technical Specification (v1 Revised)

This document consolidates the full product definition and technical architecture for Life City Awareness. It is intended as the primary reference for development. Wherever a decision was explicitly made during planning, it is stated as final. Wherever something is an open assumption, it is flagged explicitly — do not silently assume a resolution.

This version incorporates architectural revisions from the technical review addressing Google Places API compliance, recommendation system design, and data model optimization.

---

# PART 1 — PRODUCT DEFINITION

## 1.1 Vision

Life City Awareness is a live map application, similar in its base layer to Google Maps, but focused on recommending places and activities based on the user's current mood, personal interests, and location — rather than just proximity or generic popularity.

**Value proposition:** A map that recommends where to go based on how you feel and what you like, not just where you are.

## 1.2 Problem Statement

Today, deciding what to do in a city requires combining multiple disconnected tools (Google Maps, Instagram, Yelp, Eventbrite), and none of them account for the user's current emotional state or specific interests. Two people in the same city, at the same time, may need completely different experiences — no existing tool distinguishes this. Additionally, coordinating spontaneous plans with friends still relies on manual back-and-forth messaging, with no natural way to express location-based social availability.

## 1.3 Target Users (Personas)

- **Camila (26) — The Social Explorer:** Goes out frequently, wants to know where the energy is tonight specifically, not a generic list of bars. Values fast coordination with friends.
- **Andrés (34) — The Calm Seeker (variable):** Remote worker, needs to disconnect without crowds or noise — but his mood is not fixed; some days he wants solitude, other days he wants to meet people, including people with a similarly introverted energy. The product must adapt to this variability, not assume a fixed personality type.
- **Sofía (29) — The Newcomer:** Recently moved to the city, lacks the "mental map" a local has of which areas are active at which times, and has no local social network yet.
- **Julián (22) — The Spontaneous Planner:** Decides quickly, low tolerance for friction, needs the app to propose something concrete and make it easy to coordinate with friends without leaving the app.

## 1.4 Core Product Concept

### 1.4.1 Base map

Displays places and points of interest similarly to Google Maps, using Mapbox for rendering and Google Places API as the underlying place data source.

**Note on API compliance:** Displaying Google Places content on a non-Google map (Mapbox) presents a contractual constraint. Resolution of this (e.g., rendering on Maps JS API or using Places UI Kit instead of raw Mapbox) is deferred to the rendering-layer implementation phase.

### 1.4.2 Mood selection

The user indicates their current mood (Social, Calm, Active, Cultural, Romantic, Productive, Explorer, Family). This filters and re-prioritizes what is highlighted on the map.

### 1.4.3 Personal preferences (onboarding + always adjustable)

Beyond mood, users define interests (jazz, wine, running, urban art, hiking, etc.) during onboarding, adjustable at any time. Mood + interests together drive personalized recommendations — mood alone is too broad and leads to generic suggestions.

### 1.4.4 Post-visit feedback

After visiting a place, the user can rate how well it aligned with their expectations (simple thumbs up/down or 1–5 scale — low friction, no long forms). This feedback actively adjusts the user's recommendation profile starting in v1 (see Part 2, Recommendation Engine, 2.3) — it is not a deferred, cosmetic-only feature.

### 1.4.5 Highlighted recommendations

Based on active mood and preferences, relevant places are visually highlighted on the map.

## 1.5 Social Layer

The social layer is a required part of the product, not optional — because a user's social disposition changes moment to moment, even for personas like Andrés who alternates between wanting solitude and wanting company.

### 1.5.1 User profile

Each user has a profile showing their interests, visible to other users they choose to connect with.

### 1.5.2 Friends

Users can add friends within the app (mutual acceptance required). Group/community features (interest-based communities) are explicitly deferred to v2. In v1, the social layer works only between accepted friends.

### 1.5.3 Internal chat

Friends can message each other directly within the app.

### 1.5.4 "I'm here" alert

A user can broadcast that they are at a specific place, notifying selected friends, who may choose to join by sharing their own location.

### 1.5.5 "Intent to go" alert

Before arriving, a user can notify selected friends of their intention to go to a place, enabling proactive coordination.

### 1.5.6 Location sharing — explicit, granular, and LIVE

Location sharing is not a global on/off switch. The user explicitly declares who can see their location for a specific share session. Sharing is live tracking — friends see the user's position move on the map in real time while the share is active — not a static snapshot. This has direct technical implications (see Part 2, Real-Time Layer, 2.5).

## 1.6 Explicitly Out of Scope for v1

- Interest-based groups/communities (deferred to v2)
- Instagram-style public social feed
- Public profiles with large-scale followers
- Meeting strangers outside the friends circle
- LLM-powered features (free-text onboarding interpretation, generated "vibe routes") — deferred, reserved for premium tiers post-v1
- Hard minimum-rating filtering — recommendation quality/relevance is handled entirely by semantic vector similarity, not by a separate rating threshold rule

## 1.7 Business Model (initial hypothesis, not final)

- **Freemium:** basic map and limited moods free
- **Premium:** vibe routes, "surprise me" mode, smart notifications, unlimited history
- **Future B2B:** local businesses pay to be featured within a specific mood/interest segment

---

# PART 2 — TECHNICAL ARCHITECTURE

## 2.1 Technology Stack (final decisions)

| Layer | Decision |
|-------|----------|
| Frontend | React |
| Backend | Express (Node.js) |
| Database | Supabase (managed Postgres) |
| Vector storage | pgvector extension on Supabase/Postgres — no dedicated vector DB |
| Geospatial queries | PostGIS extension on Supabase/Postgres — no Redis in v1 (see 2.6) |
| Frontend hosting | Vercel |
| Backend hosting | Render |
| Map rendering | Mapbox |
| Place data source | Google Places API |
| Real-time layer | Supabase Realtime (built on WebSockets) |
| Auth | clerk

**Rationale:** Supabase covers relational data, vector storage, auth, and real-time in a single system, minimizing operational surface area for an early-stage product. Do not introduce additional infrastructure (Redis, a dedicated vector DB, a separate real-time server) unless a measured production bottleneck justifies it. Avoid premature infrastructure complexity.

## 2.2 Google Places API Integration Strategy — Compliant Persistence

**Core principle:** Google's terms permit persisting **only** `place_id` (indefinitely) and lat/lng (≤30 days). Name, category, opening hours, ratings, and reviews are **fetch-live-and-discard** — they may not be stored durably and may not be used to build or train a stored embedding. This constraint reshapes the Places integration architecture relative to earlier drafts.

### 2.2.1 Live-fetch with geo-cell throttling (not cache-aside)

The earlier cache-aside pattern (serving persistent Place content from the local table) is **replaced** by live-fetch-with-throttling:

```
User views map at viewport (bounds)
→ Determine which geo-cells intersect the viewport
→ For each cell:
  IF cell was queried recently (within TTL window, 15–30 min)
    → skip API call, don't serve cached Place data
  ELSE
    → call Places API for that cell
    → UPSERT skeleton rows into `Place` by `google_place_id`
      (store only: place_id, lat/lng, and first-party vectors)
    → update `GeoCacheZone.last_queried_at` (throttle scheduler, not freshness cert)
    → fetch Basic-tier data live per request for rendering / Stage 1 filtering
      (discard immediately after request completes)
    → return results to client
```

- **Google content (name/category/hours)** is fetched live per request, never persisted beyond that request.
- **Geo-cells** now schedule throttling of live queries, not certification of cached content freshness.
- Cost still decouples from user count and scales with geographic coverage and refresh frequency.

### 2.2.2 Pan/zoom handling (viewport-based fetching)

- Map panning must never trigger a fetch per movement frame.
- Debounce viewport-change events (~300–500ms after movement settles) before evaluating which cells need fetching.
- On each debounced viewport change, diff against the previous viewport to fetch only newly-visible cells, not the full overlap again.

### 2.2.3 Cheap tier only; no enrichment job

**All** Places API calls use the cheapest tier (Basic Data / Contact) — name, location, category, opening hours. The earlier "Atmosphere-tier enrichment job" is **eliminated**:

- No per-place background job fetching review snippets.
- No persistent storage of Google review text.
- No derived `place_embedding` from Google content.

Ranking quality and place "vibe" are now sourced entirely from **first-party, user-owned signals** (see 2.3 and 2.7).

### 2.2.4 Scope of coverage (launch cities vs. global map)

Panning is not technically restricted — the live-fetch pattern above works for any location globally. However, recommendations, busyness data, and the full first-party vibe signal should gracefully degrade outside active launch cities (i.e., show the base Mapbox map without mood/recommendation highlighting, or a "not yet available in this area" state) rather than attempting to serve full functionality everywhere from day one. This is a strategic/cost decision, not a technical limitation, and should remain configurable (list of active launch cities/regions).

## 2.3 Recommendation Engine — 4 Layers (v1 implements Layers 1–3; Layer 4 deferred)

**Scope note:** Embeddings (Layer 2) and the feedback loop (Layer 3) are core to v1. Only Layer 4 (LLM usage) remains deferred.

| Layer | Function | v1 status | Notes |
|-------|----------|-----------|-------|
| 1 — Hard rules | Filtering by category, distance, opening hours, mood→category mapping on **live** Google data | ✅ v1 | Ephemeral; no persisted Google content |
| 2 — Semantic similarity | Vector similarity between user preference and **first-party `place_vector`** | ✅ v1 | No Google review embeddings; sourced from CategoryVibePrior + behavioral signals |
| 3 — Feedback loop | Two-sided: nudges per-mood user vector **and** place behavioral vector | ✅ v1 | Mood-scoped (fixes mood contamination) |
| 4 — Punctual LLM | Free-text onboarding, "vibe routes" (premium) | 🔜 v2+ | Unchanged |

### 2.3.1 Two-stage recommendation flow

**Stage 1 — Hard filtering (live, ephemeral)**

Candidates = Places matching:
- mood → category mapping
- max distance
- open now

(No persistent rating/atmosphere data; all data fetched live and discarded)

**Stage 2 — Embedding-based ranking (first-party vectors only)**

For each candidate:

```
place_vector = compose_place_vector(candidate)  # See 2.3.2
explicit_score = mean_topk(
  cosine_sim(place_vector, interest_tag_vec) 
  for interest_tag_vec in user.interest_set
)
learned_score = cosine_sim(
  place_vector, 
  UserPreferenceVector[user, active_mood].vector  # if it exists
)
w_learned = mood.evidence_count / (mood.evidence_count + M)  # M ≈ 5
final_score = (1 - w_learned) * explicit_score + w_learned * learned_score
```

Sort candidates by final_score descending, highlight top-N on map.

Hard rules always run first to shrink the candidate set before any vector comparison — this keeps the embedding step cheap (dozens of candidates, not the entire Place table) and keeps quality/relevance filtering entirely inside the embedding step, with no separate rating threshold.

### 2.3.2 Composing place_vector at request time (first-party signals only)

`place_vector` is **never** stored as a Google-derived embedding. It is assembled per request from two first-party components:

```
category_prior = CategoryVibePrior[normalize(live_google_category)].vector
behavioral     = Place.behavioral_vector  (may be null initially)

w_behavioral = behavioral_evidence_count / (behavioral_evidence_count + K)  # K ≈ 10
place_vector = normalize(
  (1 - w_behavioral) * category_prior + w_behavioral * behavioral
)
```

- **Cold place (no signal):** w_behavioral = 0 → ranked purely on the category prior authored by you. Immediately rankable, not just a plain pin.
- **Well-visited place:** w_behavioral → 1 → ranked on real, mood-tagged behavior from your users. This is richer vibe signal than review text.
- **Cost:** No per-place embedding calls, ever. You embed `InterestVocabulary` and `CategoryVibePrior` **once** at setup; per-place work is pure vector arithmetic at request time.

### 2.3.3 User preference model: interest set + per-mood learned vectors

**Explicit taste (multi-modal):** the set of `UserInterest.tag` vectors from `InterestVocabulary`. **Never averaged** into one point (averaging loses multi-modal taste). Aggregated at scoring time via mean-of-top-k similarities.

**Revealed taste (per mood):** `UserPreferenceVector[user, mood]`, learned from feedback, lazily created per mood. This separation fixes the mood-contamination problem: feedback under one mood no longer skews the others.

- Initial generation (onboarding): derived from the explicit interest set.
- Updated only in response to feedback under the active mood (see 2.3.4).

### 2.3.4 Feedback loop (Layer 3) — two-sided, mood-scoped, pure vector math

On a rated `Visit(place, mood, alignment_rating)`:

```
direction = +1 if alignment_rating >= 4 else -1
α = 0.10 if direction > 0 else 0.05  # asymmetric; conservative on negatives

# (1) Update the user's vector for THIS mood only
uv = UserPreferenceVector[user, mood]  # lazily create from base_preference_vector if needed
uv.vector = normalize(
  uv.vector * (1 - α) + place_vector * α * direction
)
uv.evidence_count += 1

# (2) Update the PLACE's behavioral vector toward the rater's taste (positive feedback only)
if direction > 0:
  rater_taste = normalize(
    mean(tag_vec for tag_vec in user.interest_set)
  )
  β = 1 / (Place.behavioral_evidence_count + 1)
  Place.behavioral_vector = normalize(
    (Place.behavioral_vector or zero_vector) * (1 - β) + rater_taste * β
  )
  Place.behavioral_evidence_count += 1
```

Both updates are pure vector operations — no embedding-API call at feedback time. Places become "described by the tastes of people who liked them," sourced entirely from data you own.

## 2.4 Busyness / Crowd-Level Data (Hybrid Model)

Google does not officially expose "Popular Times" data via any public API. The busyness signal uses a hybrid, prioritized-source model:

1. Are there ≥3 reports from **UNIQUE** users within the last hour for this place?
   - YES → use recency-weighted average of those reports
2. Is there a cached, still-valid scraped value for this place?
   - YES → use it
3. Is the scraping circuit breaker closed AND is there daily budget remaining?
   - YES → make exactly 1 scraping call, cache the result, return it
4. Otherwise → return "insufficient data" — never fabricate a value

### 2.4.1 Weighting formula

```
weight_i = e^(-minutes_elapsed_i / 25)
current_busyness = Σ(weight_i × reported_level_i) / Σ(weight_i)
```

Half-life ≈ 25 minutes — recent reports dominate, reports older than ~90 minutes contribute negligibly.

### 2.4.2 Anti-abuse constraint

A single user may report the same place at most once per 15-minute window (enforced via database unique constraint on `(user_id, place_id, time_bucket_15min)`). The ≥3 threshold must count unique reporting users, not report volume, to prevent a single user from simulating consensus.

### 2.4.3 Scraping budget and circuit breaker

- Fixed conservative daily budget: 50 calls/day at launch.
- Calls are allocated via a priority queue based on real demand: each time a place is requested without sufficient data, increment `Place.demand_signal`; periodically (e.g., hourly), spend remaining budget on the highest-demand places first; reset demand_signal after serving.
- Circuit breaker (closed / open / half_open) protects against wasting budget on a failing or blocked scraping provider — opens after repeated failures, periodically retries in half_open state.

**Note:** The scraping component carries ToS and fragility risks (review §1) and is deferred in priority. Crowdsourced busyness is the primary signal; scraping is a fallback and may be disabled or replaced with a licensed provider (BestTime, Foursquare signals) at launch if crowdsource density is insufficient.

## 2.5 Real-Time Layer

| Feature | Mechanism | Rationale |
|---------|-----------|-----------|
| Map browsing & recommendations | Regular fetch/polling | Data changes on the cache TTL cycle (15–30 min) — no need for push |
| Busyness level | Regular fetch/polling | Same as above |
| Internal chat | Supabase Realtime (WebSockets) | Requires instant message delivery |
| "I'm here" / "Intent to go" alerts | Supabase Realtime | Needs immediate push while app is open |
| Live location sharing | Supabase Realtime, ephemeral broadcast only | See 2.5.1 |

### 2.5.1 Live location sharing — mandatory design constraints

The user explicitly selected live tracking (friends see the user's position move in real time), not a static snapshot. This requires the following non-negotiable design rules:

1. **No historical persistence.** Do not store a history of GPS pings. Only the most recent known position is persisted (`LocationShare.last_known_lat/lng`, `last_ping_at`) for reconnection purposes. Storing continuous location history is a privacy liability and unnecessary storage cost.

2. **Channel-level authorization, not just UI-level.** Access to a live-location Realtime channel must be enforced via Row Level Security on the server side — a friend not present in the share's recipients must be unable to subscribe to the channel at all, regardless of client behavior. Use Supabase Realtime private channels with RLS policies, not public channels.

3. **Server-enforced expiration.** When `expires_at` is reached, the server must revoke channel access immediately — expiration must not be a client-side visual hide while the stream technically continues.

4. **Stale-connection handling.** If no new ping arrives within 60 seconds, the UI must show a "signal lost" state rather than displaying a frozen position as if it were current.

## 2.6 Geospatial Query Strategy

**Decision:** Postgres + PostGIS only in v1. No Redis.

Redis is a valid future optimization for extremely high-frequency repeated geo-queries, but introduces additional operational complexity (another service to deploy, monitor, and invalidate) that is not justified before real production load data exists. PostGIS with a GIST index on the location column is sufficient for the expected scale (thousands to low millions of places). Revisit only if profiling in production identifies Postgres as a bottleneck.

---

## 2.7 Consolidated Data Model (Revised)

### User [CHANGED]

```
User
├── id                         (pk)
├── email                      (unique)
├── name
├── created_at
├── base_preference_vector     (vector, nullable — fallback when no mood-specific vector exists)
└── onboarding_completed_at
```

Removed single `preference_embedding` (caused averaging and mood-contamination issues). Preference is now split across an interest set and per-mood learned vectors.

### InterestVocabulary [NEW]

Fixed, first-party vocabulary embedded **once** at setup. This is the entire embedding-API cost surface in v1.

```
InterestVocabulary
├── tag                (pk, e.g. "jazz", "wine", "running")
├── vector             (vector — embedding of tag + authored description)
└── updated_at
```

### UserInterest [CHANGED]

References shared vocabulary instead of carrying its own text to embed.

```
UserInterest
├── id                 (pk)
├── user_id            (FK → User)
├── tag                (FK → InterestVocabulary.tag)
└── weight             (float — user-adjustable affinity)
```

### CategoryVibePrior [NEW]

Your **authored** mapping from a normalized category to a vibe descriptor, embedded once. First-party editorial content (you write the descriptors), so it is compliant to store.

```
CategoryVibePrior
├── category_key       (pk, e.g. "coffee_shop", "park")
├── descriptor         (text — authored by you, e.g. "intimate, low-lit, quiet")
├── vector             (vector — embedding of descriptor)
└── updated_at
```

### UserPreferenceVector [NEW]

Per-(user, mood) learned preference vector. Created lazily on first feedback under a mood. This fixes the mood-leak issue.

```
UserPreferenceVector
├── id                 (pk)
├── user_id            (FK → User)
├── mood_type          (enum: social, calm, active, cultural, romantic, productive, explorer, family)
├── vector             (vector — learned; initialized from base_preference_vector)
├── evidence_count     (int — # of feedback events; drives learned-vs-explicit weighting)
└── updated_at
   └── UNIQUE (user_id, mood_type)
```

### MoodSession [UNCHANGED]

```
MoodSession
├── id                 (pk)
├── user_id            (FK → User)
├── mood_type          (enum: social, calm, active, cultural, romantic, productive, explorer, family)
├── started_at
└── ended_at
```

### Place [CHANGED — first-party skeleton]

Holds only permanently-cacheable Google identifier, short-lived coordinates, and vectors/aggregates computed from **your** data. Name/category/hours/reviews are **not** stored — fetched live per request.

```
Place
├── id                            (pk)
├── google_place_id               (unique — permanent, upsert key; ONLY durable Google datum)
├── last_known_lat                (≤30-day cache, refreshed on access)
├── last_known_lng                (≤30-day cache, refreshed on access)
├── coords_cached_at              (drives 30-day expiry / refresh)
├── behavioral_vector             (vector, nullable — accreted from user signals)
├── behavioral_evidence_count     (int — confidence weight)
├── demand_signal                 (int — busyness scraping priority)
├── last_signal_at
└── created_at

NOT STORED (fetched live, discarded): name, category, opening_hours, rating, 
price_level, review snippets, raw Places metadata.
```

Volatile busyness fields moved to `PlaceBusyness` (see below).

### PlaceBusyness [NEW]

Isolates high-churn busyness state from read-heavy `Place` skeleton to avoid row bloat and vacuum pressure.

```
PlaceBusyness
├── place_id                   (pk, FK → Place)
├── current_busyness_level     (enum: empty, calm, moderate, busy, very_busy)
├── busyness_source            (enum: crowdsourced, scraped, insufficient_data)
├── unique_reporters_recent    (int)
├── busyness_computed_at
└── updated_at
```

### GeoCacheZone [CHANGED — role narrowed]

No longer a content-freshness certificate. Now a scheduler: records which cells were queried live and when, to debounce/throttle live Places fetches.

```
GeoCacheZone
├── id                    (pk)
├── cell_id               (geohash or fixed grid identifier)
├── last_queried_at       (throttles live re-fetch; not "serve from cache")
└── skeleton_count        (# of Place skeletons known in this cell)
```

### CrowdReport [UNCHANGED]

```
CrowdReport
├── id                    (pk)
├── user_id               (FK → User)
├── place_id              (FK → Place)
├── busyness_level        (enum: empty, calm, moderate, busy, very_busy)
├── reported_at
└── UNIQUE (user_id, place_id, time_bucket_15min)
```

### ScrapingBudget [UNCHANGED]

```
ScrapingBudget
├── id                       (pk)
├── date
├── calls_made
├── daily_limit
└── circuit_breaker_status   (enum: closed, open, half_open)
```

### Visit [CHANGED]

Same shape; the rating now updates **both** the user's mood-scoped vector **and** the place's behavioral vector.

```
Visit
├── id                  (pk)
├── user_id             (FK → User)
├── place_id            (FK → Place)
├── mood_at_visit       (enum)
├── visited_at
└── alignment_rating    (1–5 — drives UserPreferenceVector AND Place.behavioral_vector)
```

### Recommendation (analytics log) [UNCHANGED]

```
Recommendation
├── id                   (pk)
├── user_id              (FK → User)
├── place_id             (FK → Place)
├── mood_session_id      (FK → MoodSession)
├── score
├── shown_at
└── clicked              (boolean)
```

### Friendship [CHANGED — canonical pair]

Store one row per relationship with an ordered pair to prevent duplicates/asymmetry.

```
Friendship
├── id              (pk)
├── user_low_id     (FK → User — always least(a,b))
├── user_high_id    (FK → User — always greatest(a,b))
├── requested_by    (FK → User — who initiated)
├── status          (enum: pending, accepted, blocked)
└── created_at
   └── UNIQUE (user_low_id, user_high_id)
```

### LocationShare [CHANGED — recipients normalized]

Replaced the `shared_with` array with a join table for clean per-recipient revocation and RLS.

```
LocationShare
├── id              (pk)
├── user_id         (FK → User)
├── place_id        (FK → Place, nullable)
├── share_type      (enum: im_here, intent_to_go)
├── last_known_lat
├── last_known_lng
├── last_ping_at
├── expires_at      (required, not nullable — server-enforced)
└── created_at
```

### LocationShareRecipient [NEW]

```
LocationShareRecipient
├── id                   (pk)
├── share_id             (FK → LocationShare)
├── recipient_user_id    (FK → User)
└── revoked_at           (nullable — individual revocation without ending share)
   └── UNIQUE (share_id, recipient_user_id)
```

### ChatMessage [UNCHANGED]

```
ChatMessage
├── id           (pk)
├── sender_id    (FK → User)
├── receiver_id  (FK → User)
├── content
├── sent_at
└── read_at
```

### Event [CHANGED — source made explicit]

```
Event
├── id              (pk)
├── place_id        (FK → Place, nullable)
├── title
├── starts_at
├── ends_at
├── mood_tags       (array)
├── source          (enum: first_party, partner_feed — defines ingestion path)
└── external_ref    (nullable — dedupe key for partner feeds)
```

---

## 2.8 Explicit Build Order Guidance for v1

To avoid over-building deferred features, implement in this order:

1. **Base map (Mapbox) + viewport-based live Places API fetching** with geo-cell throttling (§2.2)
   - Live-fetch with discard, no persistent Google content storage

2. **`InterestVocabulary` + `CategoryVibePrior` embedding** (one-time setup)
   - Embed fixed vocabulary + your authored category vibe descriptors
   - This is the **entire** embedding cost surface in v1

3. **Place skeleton model and geo-cell throttling scheduler** (§2.7)
   - `Place` table holds only `place_id` + short-lived coords + first-party vectors
   - No background enrichment job needed

4. **User onboarding with interest tags** → `UserInterest` (linked to `InterestVocabulary`) + initial `base_preference_vector` (§2.7)

5. **Mood selection (Stage 1 hard-rule filtering)** + **embedding-based ranking (Stage 2)** (§2.3) — implemented together as two-stage recommendation flow
   - Use `place_vector` composed at request time from category prior + behavioral signal

6. **Post-visit rating** (`Visit.alignment_rating`) + **two-sided feedback loop** (§2.3.4)
   - Updates both `UserPreferenceVector[user, mood]` (mood-scoped) and `Place.behavioral_vector`

7. **Crowd-level hybrid system** (§2.4): crowdsourced reporting first, scraping fallback second
   - Scope appropriately: busyness is optional at launch if crowdsourced density is low

8. **Friends system + internal chat** (Supabase Realtime)

9. **"I'm here" / "Intent to go" alerts**

10. **Live location sharing** (§2.5.1) — implement last, given its higher complexity and privacy sensitivity
    - Use Supabase Realtime private channels with RLS

**Removed:** The "background enrichment job" (earlier step 2) is **eliminated** — no per-place async fetching of Google review text or generation of derived embeddings.

Only Layer 4 (LLM-powered features, §2.3) remains genuinely deferred to v2+ — do not build free-text onboarding interpretation or generated "vibe routes" in v1.

---

## 2.9 Key Architectural Decisions & Tradeoffs

### Why first-party vectors over Google embeddings?

**Problem:** Google's terms prohibit storing review text and using it to train/derive embeddings.

**Solution:** Build "place vibe" from signals you own:
- **CategoryVibePrior:** You author vibe descriptors per category once (e.g., "coffee_shop" → "intimate, low-lit, quiet"). Embed once. Reuse across all places.
- **Behavioral signal:** Places become described by the tastes of users who liked them. Rich, richer than review text alone, and 100% your data.

**Tradeoff:** Cold places rank on the category prior (not reviews). This is acceptable and arguably better: review-based embeddings are biased by review text quality, star-count noise, and spam. Category-based + behavioral is cleaner.

### Why per-mood learned vectors?

**Problem:** Single global `preference_embedding` drifts when user rates a romantic dinner 5-stars then switches to "productive" mood. The romantic signal contaminates all downstream sessions.

**Solution:** `UserPreferenceVector[user, mood]` — one vector per mood, learned only from feedback under that mood.

**Tradeoff:** 8x more vectors per user. Storage is negligible (8 × 1536-d float32 ≈ 48KB per user). Correctness wins.

### Why no embedding-API call at feedback time?

**Problem:** Real-time nudge-the-vector would require an embedding call per rating. Cost, latency, and potential compliance issues.

**Solution:** Pure vector math. The place's `place_vector` is computed once at request time; feedback is a weighted average. Instant, cost-free, compliant.

### Why live-fetch (not cache-aside)?

**Problem:** Google's terms don't permit storing name/category/hours durably. Cache-aside (serving from Place table) violates that.

**Solution:** Fetch live per request, discard immediately. Throttle repeats via `GeoCacheZone.last_queried_at` to avoid spamming the API.

**Tradeoff:** Slightly higher per-request latency (API call per viewport for new cells). Acceptable because:
- Geo-cells are large; panning doesn't constantly introduce new cells.
- Viewport changes are debounced.
- API calls are cheap tier (Basic Contact).
- Compliance is non-negotiable.

---

## Architectural Assumptions & Open Questions

1. **Embedding model & dimension** for `InterestVocabulary` and `CategoryVibePrior` (e.g., `text-embedding-3-small`, 1536-d). Confirm before implementation. This is the only ongoing embedding-API cost in v1.

2. **Per-mood vector shape confirmed** (8 vectors/user) vs. single global learned vector. Per-mood is recommended to fix mood-leak, but confirm alignment with product vision.

3. **Confidence constants** in 2.3.2 (`K ≈ 10`) and 2.3.1 (`M ≈ 5`) are starting guesses. Tune once real feedback data exists.

4. **Rendering-layer resolution:** Displaying Google Places content on a non-Google map violates Google's terms. Resolve early (e.g., use Maps JS API or Places UI Kit) — this spec treats the data/logic layer as compliant but flags the rendering constraint.

5. **Scraping decision:** ToS and fragility risks are real (§2.4.3 and review notes). Crowd-sourced busyness is the primary signal. Consider disabling scraping at launch or replacing it with a licensed provider (BestTime, Foursquare).

---

## Version History

- **v1.0 (original):** Initial product and technical spec with cache-aside persistence and per-place Google-review embeddings.
- **v1.1 (review revision):** Architectural audit identifying Google Places API compliance issues and recommendation-engine design problems. Introduced first-party vector model, per-mood learned preference, geo-cell throttling, and split Place/PlaceBusyness tables.
- **v1 Revised (merged):** This document integrates all v1.1 revisions into the v1 structure, marked with **[CHANGED]** or **[NEW]** where applicable.

---

This document reflects all decisions made during the planning phase and the architectural review. Any deviation from what is specified here — particularly around Google Places API compliance, first-party vector sourcing, per-mood preference scoping, or deferred-to-v2 boundaries — should be flagged and confirmed before implementation, not assumed.
