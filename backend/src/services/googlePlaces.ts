/**
 * Google Places API (New) client — Basic tier fields only (§2.2.3).
 *
 * Compliance (§2.2): results are fetched live and returned to the caller for the
 * current request only. NOTHING from these responses is persisted except
 * `place_id` and lat/lng (≤30-day cache) — see placesService.ts.
 */

const PLACES_BASE = 'https://places.googleapis.com/v1'

const API_KEY = process.env.GOOGLE_MAPS_API_KEY
if (!API_KEY) throw new Error('Missing GOOGLE_MAPS_API_KEY')

/** Ephemeral, per-request shape. Never write these fields to the database. */
export interface LivePlace {
  googlePlaceId: string
  name: string
  category: string | null
  types: string[]
  lat: number
  lng: number
  openNow: boolean | null
  address: string | null
}

const NEARBY_FIELD_MASK = [
  'places.id',
  'places.displayName',
  'places.types',
  'places.primaryType',
  'places.location',
  'places.currentOpeningHours.openNow',
  'places.shortFormattedAddress',
].join(',')

interface GooglePlaceResponse {
  id: string
  displayName?: { text?: string }
  types?: string[]
  primaryType?: string
  location?: { latitude: number; longitude: number }
  currentOpeningHours?: { openNow?: boolean }
  shortFormattedAddress?: string
}

function toLivePlace(p: GooglePlaceResponse): LivePlace | null {
  if (!p.id || !p.location) return null
  return {
    googlePlaceId: p.id,
    name: p.displayName?.text ?? 'Unknown',
    category: p.primaryType ?? p.types?.[0] ?? null,
    types: p.types ?? [],
    lat: p.location.latitude,
    lng: p.location.longitude,
    openNow: p.currentOpeningHours?.openNow ?? null,
    address: p.shortFormattedAddress ?? null,
  }
}

export async function searchNearby(
  lat: number,
  lng: number,
  radiusMeters: number,
  includedTypes?: string[],
  maxResultCount = 20,
): Promise<LivePlace[]> {
  const body: Record<string, unknown> = {
    maxResultCount,
    locationRestriction: {
      circle: { center: { latitude: lat, longitude: lng }, radius: Math.min(radiusMeters, 50000) },
    },
  }
  if (includedTypes?.length) body.includedTypes = includedTypes

  const res = await fetch(`${PLACES_BASE}/places:searchNearby`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': API_KEY!,
      'X-Goog-FieldMask': NEARBY_FIELD_MASK,
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Places searchNearby failed (${res.status}): ${text}`)
  }
  const json = (await res.json()) as { places?: GooglePlaceResponse[] }
  return (json.places ?? []).map(toLivePlace).filter((p): p is LivePlace => p !== null)
}

/** Live single-place lookup (Basic tier) for rendering details on demand. */
export async function getPlaceDetails(googlePlaceId: string): Promise<LivePlace | null> {
  const fieldMask = NEARBY_FIELD_MASK.replaceAll('places.', '')
  const res = await fetch(`${PLACES_BASE}/places/${encodeURIComponent(googlePlaceId)}`, {
    headers: { 'X-Goog-Api-Key': API_KEY!, 'X-Goog-FieldMask': fieldMask },
  })
  if (res.status === 404) return null
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Places details failed (${res.status}): ${text}`)
  }
  return toLivePlace((await res.json()) as GooglePlaceResponse)
}
