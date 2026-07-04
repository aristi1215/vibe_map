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
 * For each cell intersecting the viewport:
 *   - if the cell was queried within the TTL window → skip the API call
 *   - else → call Places API, upsert SKELETON rows (place_id + coords only),
 *     stamp GeoCacheZone.last_queried_at
 *
 * Live Google content (name/category/hours) is returned to the caller for this
 * request only and discarded afterwards — it is never persisted (§2.2).
 */

export interface PlaceWithSkeleton extends LivePlace {
  /** internal Place.id, present once the skeleton row exists */
  placeId: string | null
}

export async function fetchViewportPlaces(
  bounds: Bounds,
  includedTypes?: string[],
): Promise<PlaceWithSkeleton[]> {
  const cellIds = cellsForBounds(bounds)
  if (cellIds.length === 0) return []

  const { data: zones, error: zoneError } = await supabase
    .from('geo_cache_zone')
    .select('cell_id, last_queried_at')
    .in('cell_id', cellIds)
  if (zoneError) throw zoneError

  const ttlMs = config.geoCellTtlMinutes * 60_000
  const now = Date.now()
  const fresh = new Set(
    (zones ?? [])
      .filter((z) => z.last_queried_at && now - new Date(z.last_queried_at).getTime() < ttlMs)
      .map((z) => z.cell_id),
  )
  const staleCells = cellIds.filter((c) => !fresh.has(c))

  const livePlaces = new Map<string, LivePlace>()
  const radius = cellRadiusMeters()

  await Promise.all(
    staleCells.map(async (cellId) => {
      const { lat, lng } = cellCenter(cellId)
      try {
        const results = await searchNearby(lat, lng, radius, includedTypes)
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

/** Fetch places around a point (used by recommendations Stage 1). */
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
  )
}
