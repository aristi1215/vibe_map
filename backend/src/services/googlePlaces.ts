/**
 * Google Places API (New) client.
 *
 * Compliance (§2.2): results are fetched live and returned to the caller for the
 * current request only. NOTHING from these responses is persisted except
 * `place_id` and lat/lng (≤30-day cache) — see placesService.ts. Ranking may embed
 * this content in RAM (see lib/embeddings.ts) but never writes it to disk/DB.
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
  /** rich fields — present only on rich fetches, used for ranking + display */
  rating?: number | null
  userRatingCount?: number | null
  priceLevel?: string | null
  editorialSummary?: string | null
}

export interface PlaceReview {
  rating: number | null
  text: string | null
  author: string | null
  authorPhoto: string | null
  relativeTime: string | null
}

export interface RichPlaceDetails extends LivePlace {
  formattedAddress: string | null
  weekdayDescriptions: string[]
  phone: string | null
  website: string | null
  googleMapsUri: string | null
  photoNames: string[]
  photoUrls: string[]
  reviews: PlaceReview[]
}

interface GooglePlaceResponse {
  id: string
  displayName?: { text?: string }
  types?: string[]
  primaryType?: string
  location?: { latitude: number; longitude: number }
  currentOpeningHours?: { openNow?: boolean; weekdayDescriptions?: string[] }
  regularOpeningHours?: { weekdayDescriptions?: string[] }
  shortFormattedAddress?: string
  formattedAddress?: string
  rating?: number
  userRatingCount?: number
  priceLevel?: string
  editorialSummary?: { text?: string }
  nationalPhoneNumber?: string
  internationalPhoneNumber?: string
  websiteUri?: string
  googleMapsUri?: string
  photos?: { name?: string; widthPx?: number; heightPx?: number }[]
  reviews?: {
    rating?: number
    text?: { text?: string }
    originalText?: { text?: string }
    authorAttribution?: { displayName?: string; photoUri?: string }
    relativePublishTimeDescription?: string
  }[]
}

const NEARBY_BASIC_MASK = [
  'places.id',
  'places.displayName',
  'places.types',
  'places.primaryType',
  'places.location',
  'places.currentOpeningHours.openNow',
  'places.shortFormattedAddress',
].join(',')

// Adds Enterprise/Atmosphere fields used by the ranker (rating, reviews summary).
const NEARBY_RICH_MASK = [
  NEARBY_BASIC_MASK,
  'places.rating',
  'places.userRatingCount',
  'places.priceLevel',
  'places.editorialSummary',
].join(',')

const DETAILS_MASK = [
  'id',
  'displayName',
  'types',
  'primaryType',
  'location',
  'formattedAddress',
  'shortFormattedAddress',
  'currentOpeningHours',
  'regularOpeningHours',
  'rating',
  'userRatingCount',
  'priceLevel',
  'editorialSummary',
  'nationalPhoneNumber',
  'internationalPhoneNumber',
  'websiteUri',
  'googleMapsUri',
  'photos',
  'reviews',
].join(',')

const TEXT_SEARCH_MASK = [
  'places.id',
  'places.displayName',
  'places.types',
  'places.primaryType',
  'places.location',
  'places.shortFormattedAddress',
  'places.rating',
  'places.userRatingCount',
].join(',')

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
    rating: p.rating ?? null,
    userRatingCount: p.userRatingCount ?? null,
    priceLevel: p.priceLevel ?? null,
    editorialSummary: p.editorialSummary?.text ?? null,
  }
}

export async function searchNearby(
  lat: number,
  lng: number,
  radiusMeters: number,
  includedTypes?: string[],
  opts: { rich?: boolean; maxResultCount?: number } = {},
): Promise<LivePlace[]> {
  const body: Record<string, unknown> = {
    maxResultCount: opts.maxResultCount ?? 20,
    rankPreference: 'POPULARITY',
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
      'X-Goog-FieldMask': opts.rich ? NEARBY_RICH_MASK : NEARBY_BASIC_MASK,
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

/** Text search (New) — powers the map search bar. */
export async function searchText(
  query: string,
  lat?: number,
  lng?: number,
): Promise<LivePlace[]> {
  const body: Record<string, unknown> = { textQuery: query, maxResultCount: 12 }
  if (lat != null && lng != null) {
    body.locationBias = { circle: { center: { latitude: lat, longitude: lng }, radius: 30000 } }
  }
  const res = await fetch(`${PLACES_BASE}/places:searchText`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': API_KEY!,
      'X-Goog-FieldMask': TEXT_SEARCH_MASK,
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Places searchText failed (${res.status}): ${text}`)
  }
  const json = (await res.json()) as { places?: GooglePlaceResponse[] }
  return (json.places ?? []).map(toLivePlace).filter((p): p is LivePlace => p !== null)
}

/**
 * Resolve a Places photo resource name to a temporary, keyless image URL that the
 * browser can load directly (the API key stays server-side).
 */
export async function resolvePhotoUrl(photoName: string, maxWidthPx = 800): Promise<string | null> {
  const res = await fetch(
    `${PLACES_BASE}/${photoName}/media?maxWidthPx=${maxWidthPx}&skipHttpRedirect=true`,
    { headers: { 'X-Goog-Api-Key': API_KEY! } },
  )
  if (!res.ok) return null
  const json = (await res.json()) as { photoUri?: string }
  return json.photoUri ?? null
}

/** Rich single-place details (Enterprise + Atmosphere) for the detail card. */
export async function getRichDetails(
  googlePlaceId: string,
  photoCount = 6,
): Promise<RichPlaceDetails | null> {
  const res = await fetch(`${PLACES_BASE}/places/${encodeURIComponent(googlePlaceId)}`, {
    headers: { 'X-Goog-Api-Key': API_KEY!, 'X-Goog-FieldMask': DETAILS_MASK },
  })
  if (res.status === 404) return null
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Places details failed (${res.status}): ${text}`)
  }
  const p = (await res.json()) as GooglePlaceResponse
  const base = toLivePlace(p)
  if (!base) return null

  const photoNames = (p.photos ?? [])
    .map((ph) => ph.name)
    .filter((n): n is string => !!n)
    .slice(0, photoCount)
  const photoUrls = (await Promise.all(photoNames.map((n) => resolvePhotoUrl(n)))).filter(
    (u): u is string => !!u,
  )

  const reviews: PlaceReview[] = (p.reviews ?? []).slice(0, 5).map((r) => ({
    rating: r.rating ?? null,
    text: r.text?.text ?? r.originalText?.text ?? null,
    author: r.authorAttribution?.displayName ?? null,
    authorPhoto: r.authorAttribution?.photoUri ?? null,
    relativeTime: r.relativePublishTimeDescription ?? null,
  }))

  return {
    ...base,
    formattedAddress: p.formattedAddress ?? p.shortFormattedAddress ?? null,
    weekdayDescriptions:
      p.currentOpeningHours?.weekdayDescriptions ?? p.regularOpeningHours?.weekdayDescriptions ?? [],
    phone: p.nationalPhoneNumber ?? p.internationalPhoneNumber ?? null,
    website: p.websiteUri ?? null,
    googleMapsUri: p.googleMapsUri ?? null,
    photoNames,
    photoUrls,
    reviews,
  }
}

/** Back-compat basic details lookup (unused by the new detail card). */
export async function getPlaceDetails(googlePlaceId: string): Promise<LivePlace | null> {
  const res = await fetch(`${PLACES_BASE}/places/${encodeURIComponent(googlePlaceId)}`, {
    headers: {
      'X-Goog-Api-Key': API_KEY!,
      'X-Goog-FieldMask': NEARBY_BASIC_MASK.replaceAll('places.', ''),
    },
  })
  if (res.status === 404) return null
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Places details failed (${res.status}): ${text}`)
  }
  return toLivePlace((await res.json()) as GooglePlaceResponse)
}
