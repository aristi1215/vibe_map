import { supabase } from '../lib/supabase.js'
import { config } from '../config.js'
import {
  cellsForBounds,
  cellCenter,
  cellRadiusMeters,
  type Bounds,
} from '../lib/geocell.js'
import { searchNearby, type LivePlace } from './googlePlaces.js'

/**
 * Live-fetch with geo-cell throttling (§2.2.1).
 *
 * Live Google content (name/category/hours) may NOT be persisted (§2.2), so the
 * DB cannot serve as a rendering cache — a cell we already fetched has no content
 * to replay. Throttling therefore uses a short-lived IN-MEMORY cache (process RAM
 * only, never written to disk/DB) so that:
 *   - every viewport request returns fully-rendered live places (fixes blank map)
 *   - repeated pans / the recommendation pass don't hammer the Places API
 *
 * For each cell intersecting the viewport:
 *   - if we fetched it within MEM_TTL (keyed by mood/includedTypes) → replay RAM copy
 *   - else → call Places API, cache in RAM, upsert SKELETON rows (place_id + coords
 *     only), stamp GeoCacheZone for analytics/behavioral bookkeeping
 */

export interface PlaceWithSkeleton extends LivePlace {
  /** internal Place.id, present once the skeleton row exists */
  placeId: string | null
}

/** Ephemeral in-process cache of live results — RAM only, evicted on TTL. */
interface CacheEntry {
  at: number
  places: LivePlace[]
}
const liveCellCache = new Map<string, CacheEntry>()

function cellCacheKey(cellId: string, includedTypes: string[] | undefined, rich: boolean): string {
  return `${rich ? 'R' : 'B'}:${cellId}::${(includedTypes ?? []).slice().sort().join(',')}`
}

function pruneCache(now: number, ttlMs: number): void {
  if (liveCellCache.size < 500) return
  for (const [key, entry] of liveCellCache) {
    if (now - entry.at >= ttlMs) liveCellCache.delete(key)
  }
}

export async function fetchViewportPlaces(
  bounds: Bounds,
  includedTypes?: string[],
  opts: { rich?: boolean } = {},
): Promise<PlaceWithSkeleton[]> {
  const rich = opts.rich ?? false
  const cellIds = cellsForBounds(bounds)
  if (cellIds.length === 0) return []

  const ttlMs = config.liveCacheTtlSeconds * 1000
  const now = Date.now()
  pruneCache(now, ttlMs)

  const radius = cellRadiusMeters()
  const livePlaces = new Map<string, LivePlace>()
  const cellsToFetch: string[] = []

  // Replay any cells still warm in RAM; queue the rest for a live fetch.
  for (const cellId of cellIds) {
    const hit = liveCellCache.get(cellCacheKey(cellId, includedTypes, rich))
    if (hit && now - hit.at < ttlMs) {
      for (const p of hit.places) livePlaces.set(p.googlePlaceId, p)
    } else {
      cellsToFetch.push(cellId)
    }
  }

  await Promise.all(
    cellsToFetch.map(async (cellId) => {
      const { lat, lng } = cellCenter(cellId)
      try {
        const results = await searchNearby(lat, lng, radius, includedTypes, { rich })
        liveCellCache.set(cellCacheKey(cellId, includedTypes, rich), { at: Date.now(), places: results })
        for (const p of results) livePlaces.set(p.googlePlaceId, p)
        await upsertSkeletons(results)
        await supabase
          .from('geo_cache_zone')
          .upsert(
            { cell_id: cellId, last_queried_at: new Date().toISOString(), skeleton_count: results.length },
            { onConflict: 'cell_id' },
          )
      } catch (err) {
        // A failing cell must not break the whole viewport
        console.error(`geo-cell ${cellId} fetch failed:`, err)
      }
    }),
  )

  return attachSkeletonIds([...livePlaces.values()])
}

/** Store ONLY google_place_id + coords (≤30-day cache) — never Google content (§2.7 Place). */
async function upsertSkeletons(places: LivePlace[]): Promise<void> {
  if (places.length === 0) return
  const nowIso = new Date().toISOString()
  const rows = places.map((p) => ({
    google_place_id: p.googlePlaceId,
    last_known_lat: p.lat,
    last_known_lng: p.lng,
    coords_cached_at: nowIso,
  }))
  const { error } = await supabase
    .from('place')
    .upsert(rows, { onConflict: 'google_place_id' })
  if (error) throw error
}

async function attachSkeletonIds(places: LivePlace[]): Promise<PlaceWithSkeleton[]> {
  if (places.length === 0) return []
  const ids = places.map((p) => p.googlePlaceId)
  const { data, error } = await supabase
    .from('place')
    .select('id, google_place_id')
    .in('google_place_id', ids)
  if (error) throw error
  const byGoogleId = new Map((data ?? []).map((r) => [r.google_place_id, r.id]))
  return places.map((p) => ({ ...p, placeId: byGoogleId.get(p.googlePlaceId) ?? null }))
}

/** Fetch places around a point (used by recommendations Stage 1 — rich fields). */
export async function fetchNearbyPlaces(
  lat: number,
  lng: number,
  radiusMeters: number,
  includedTypes?: string[],
): Promise<PlaceWithSkeleton[]> {
  const degRadius = radiusMeters / 111_320
  return fetchViewportPlaces(
    {
      north: lat + degRadius,
      south: lat - degRadius,
      east: lng + degRadius / Math.max(Math.cos((lat * Math.PI) / 180), 0.01),
      west: lng - degRadius / Math.max(Math.cos((lat * Math.PI) / 180), 0.01),
    },
    includedTypes,
    { rich: true },
  )
}
