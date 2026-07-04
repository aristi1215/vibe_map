# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project status

This repository currently contains **no application code** — only the product/technical specification (`life_city_awareness_merged.md`). There is no build, lint, or test tooling yet because nothing has been implemented. When code is added, this file should be updated with the actual commands (package manager, test runner, etc.).

The specification in `life_city_awareness_merged.md` is the **primary source of truth** for what to build and how. Read it in full before starting implementation work — it contains final decisions (treat as binding) and explicitly flagged open assumptions (do not silently resolve these; ask/confirm instead).

## Product summary

**Life City Awareness** is a live map app (Google Maps-like base layer) that recommends places/activities based on the user's current **mood** + **personal interests** + location, not just proximity or generic popularity. It includes a required social layer (friends, chat, live location sharing, "I'm here" / "intent to go" alerts) — this is not a bolt-on feature.

Explicitly out of scope for v1: interest-based groups/communities, public social feed, public profiles/followers, meeting strangers, LLM-powered features (free-text onboarding, generated "vibe routes" — deferred to v2+/premium), and hard minimum-rating filtering (relevance is handled entirely by vector similarity).

## Technology stack (final decisions — don't deviate without confirming)

| Layer | Choice |
|---|---|
| Frontend | React |
| Backend | Express (Node.js) |
| Database | Supabase (managed Postgres) |
| Vector storage | pgvector on Supabase/Postgres (no dedicated vector DB) |
| Geospatial | PostGIS on Supabase/Postgres (no Redis in v1) |
| Frontend hosting | Vercel |
| Backend hosting | Render |
| Map rendering | Mapbox |
| Place data | Google Places API |
| Real-time | Supabase Realtime (WebSockets) |
| Auth | Clerk |

Do not introduce additional infrastructure (Redis, a dedicated vector DB, a separate real-time server) unless a measured production bottleneck justifies it — this is an explicit anti-premature-optimization decision in the spec, not an oversight.

## Architecture — critical constraints to preserve

### Google Places API compliance is non-negotiable

Google's terms permit persisting **only** `place_id` (indefinitely) and lat/lng (≤30 days). Name, category, hours, ratings, and reviews must be **fetched live and discarded per request** — never persisted, never used to derive a stored embedding. This shapes the entire `Place` data model and recommendation pipeline (see §2.2, §2.7 of the spec). If you find yourself caching or storing Google-sourced content beyond `place_id`/coords, stop — that violates the architecture.

Practical implications:
- Live-fetch with geo-cell throttling (`GeoCacheZone.last_queried_at`), not cache-aside.
- Viewport pan/zoom fetches must be debounced (~300–500ms) and diffed against the previous viewport.
- Only the cheapest Places API tier (Basic Data/Contact) is used; there is no background enrichment job fetching review text.

### Recommendations are built from first-party vectors, never Google content

`place_vector` is composed at request time from two owned signals — never a Google-derived embedding:
- `CategoryVibePrior` — vibe descriptors you author per category, embedded once at setup.
- `Place.behavioral_vector` — accreted from your users' post-visit feedback ("places described by the tastes of people who liked them").

The only embedding-API cost surface in v1 is embedding `InterestVocabulary` and `CategoryVibePrior` once at setup — no per-place or per-feedback embedding calls, ever (pure vector arithmetic instead). See spec §2.3.2–2.3.4 for the exact formulas (cold-start weighting, feedback update rules, asymmetric learning rate for positive vs. negative feedback).

### Per-mood preference vectors (not one global vector)

User preference is split into an explicit multi-modal interest set (`UserInterest` tags, never averaged into one point) and per-`(user, mood)` learned vectors (`UserPreferenceVector`). This is a deliberate fix for "mood contamination" — feedback given in one mood must not leak into recommendations for a different mood. When touching recommendation or feedback code, keep mood-scoping intact.

### Live location sharing has non-negotiable privacy rules (spec §2.5.1)

1. No historical GPS persistence — only the most recent position (`last_known_lat/lng`, `last_ping_at`) is stored, for reconnection only.
2. Authorization must be enforced via Supabase Realtime private channels + Row Level Security (server-side), not just UI-level checks.
3. Expiration (`expires_at`) must be server-enforced — revoke channel access immediately, not a client-side hide.
4. If no ping arrives within 60s, the UI must show "signal lost," not a stale frozen position.

### Busyness data is a hybrid, never fabricated

Priority order: (1) ≥3 unique-user crowd reports in the last hour (recency-weighted, half-life ~25 min) → (2) valid cached scrape → (3) one new scrape call if circuit breaker closed and budget remains → (4) otherwise return "insufficient data," never a made-up value. Anti-abuse: one report per user per place per 15-minute bucket, and the ≥3 threshold counts **unique reporters**, not report volume.

## Build order (spec §2.8 — follow this sequence, don't front-load deferred features)

1. Base map (Mapbox) + viewport-based live Places fetching with geo-cell throttling
2. One-time embedding of `InterestVocabulary` + `CategoryVibePrior`
3. `Place` skeleton model + geo-cell throttling scheduler
4. Onboarding (`UserInterest` + `base_preference_vector`)
5. Mood selection (hard-rule filtering) + embedding-based ranking, built together
6. Post-visit rating + two-sided feedback loop (updates both `UserPreferenceVector` and `Place.behavioral_vector`)
7. Crowd-level hybrid busyness system (crowdsourcing first, scraping fallback second — optional at launch)
8. Friends system + internal chat (Supabase Realtime)
9. "I'm here" / "Intent to go" alerts
10. Live location sharing (last — highest complexity and privacy sensitivity)

There is no "background enrichment job" step — it was explicitly eliminated from an earlier draft; do not reintroduce per-place async fetching of Google review text.

## Open assumptions — confirm before implementing, don't silently resolve

- Embedding model/dimension for `InterestVocabulary`/`CategoryVibePrior` (spec suggests `text-embedding-3-small`, 1536-d, as a placeholder).
- Per-mood vector shape (8 vectors/user) vs. a single global vector — per-mood is recommended but not fully locked.
- Confidence constants `K ≈ 10` (behavioral vector weighting) and `M ≈ 5` (learned vs. explicit score weighting) are starting guesses, to be tuned against real feedback data.
- Rendering-layer resolution for displaying Google Places content on non-Google map tiles (Mapbox) — a real contractual constraint, deferred to the rendering-layer implementation phase (e.g., Maps JS API or Places UI Kit may be required instead of raw Mapbox).
- Whether scraping-based busyness is enabled at launch or replaced by a licensed provider (BestTime, Foursquare) — crowdsourcing is the primary signal regardless.

## Data model reference

The full schema (`User`, `InterestVocabulary`, `UserInterest`, `CategoryVibePrior`, `UserPreferenceVector`, `MoodSession`, `Place`, `PlaceBusyness`, `GeoCacheZone`, `CrowdReport`, `ScrapingBudget`, `Visit`, `Recommendation`, `Friendship`, `LocationShare`, `LocationShareRecipient`, `ChatMessage`, `Event`) is defined in full in `life_city_awareness_merged.md` §2.7, including field-level rationale for what changed from earlier drafts and why. Consult it directly rather than re-deriving the schema — in particular note which fields on `Place` are explicitly **not stored** (name, category, opening_hours, rating, price_level, review snippets).
