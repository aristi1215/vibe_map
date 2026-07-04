# Vibe Map

Mood-based live map application. Recommends places based on your current mood, interests, and location.

## Structure

```
vibe-map/
├── frontend/          # React + Vite + TypeScript
├── backend/           # Express + Node.js + TypeScript
├── supabase/
│   └── migrations/    # SQL migrations to run in Supabase dashboard
└── agent_docs/        # Product & technical specification
```

## Prerequisites

- Node.js 18+
- A Supabase project with `vector` and `postgis` extensions enabled
- Clerk account
- Mapbox account
- Google Maps/Places API key
- OpenAI API key (for one-time embedding setup — `text-embedding-3-large`)

## Setup

### 1. Supabase Extensions

In your Supabase dashboard → **Database → Extensions**, enable:
- `vector` (pgvector)
- `postgis`

### 2. Run the migration

In your Supabase dashboard → **SQL Editor**, run:
```
supabase/migrations/001_initial_schema.sql
```

### 3. Environment variables

**Frontend** — copy `frontend/.env.local.example` to `frontend/.env.local` and fill in:
```
VITE_CLERK_PUBLISHABLE_KEY=
VITE_SUPABASE_URL=
VITE_SUPABASE_PUBLISHABLE_KEY=
VITE_MAPBOX_PUBLIC_TOKEN=
```

**Backend** — copy `backend/.env.example` to `backend/.env` and fill in:
```
PORT=3001
FRONTEND_URL=http://localhost:5173
VITE_SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=
GOOGLE_MAPS_API_KEY=
OPENAI_API_KEY=        # needed for one-time embedding setup only
```

### 4. Install dependencies

```bash
npm run install:all
```

Or individually:
```bash
cd frontend && npm install
cd backend && npm install
```

## Running

### Both apps concurrently (from root)
```bash
npm run dev
```

### Individually
```bash
# Frontend — http://localhost:5173
cd frontend && npm run dev

# Backend — http://localhost:3001
cd backend && npm run dev
```

### Verify backend is up
```
GET http://localhost:3001/health
```

## Tech Stack

| Layer | Choice |
|---|---|
| Frontend | React 19, Vite, TypeScript |
| Styling | Tailwind CSS v3 |
| Routing | TanStack Router v1 (file-based) |
| Data fetching | TanStack Query v5 |
| Map | Mapbox GL JS + react-map-gl |
| Auth | Clerk |
| Backend | Express 4, Node.js, TypeScript |
| Database | Supabase (Postgres + pgvector + PostGIS) |
| Realtime | Supabase Realtime |
| Runtime dev | tsx watch |

## Database Schema (18 tables)

`user`, `interest_vocabulary`, `user_interest`, `category_vibe_prior`, `user_preference_vector`, `mood_session`, `place`, `place_busyness`, `geo_cache_zone`, `crowd_report`, `scraping_budget`, `visit`, `recommendation`, `friendship`, `location_share`, `location_share_recipient`, `chat_message`, `event`

See `agent_docs/life_city_awareness_merged.md` §2.7 for full schema rationale.

## Notes

- `frontend/src/routeTree.gen.ts` is a stub. It will be **overwritten automatically** by the TanStack Router Vite plugin on the first `npm run dev`.
- All Google Places content (name, category, hours, ratings) is **never persisted** — fetched live per request per Google ToS (§2.2 of spec).
- Vector dimension is `3072` (OpenAI `text-embedding-3-large`). Change in migration if switching models.
