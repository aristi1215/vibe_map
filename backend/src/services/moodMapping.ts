import type { MoodType } from '../types/index.js'

/**
 * Mood → Google place-type mapping used by Stage 1 hard filtering (§2.3.1)
 * and by viewport fetches when a mood is active.
 */
export const MOOD_CATEGORIES: Record<MoodType, string[]> = {
  social: ['bar', 'night_club', 'restaurant', 'pub', 'karaoke', 'bowling_alley'],
  calm: ['park', 'cafe', 'coffee_shop', 'book_store', 'spa', 'garden', 'library'],
  active: ['gym', 'fitness_center', 'sports_complex', 'hiking_area', 'swimming_pool', 'bicycle_store', 'stadium'],
  cultural: ['museum', 'art_gallery', 'performing_arts_theater', 'historical_landmark', 'cultural_center', 'library'],
  romantic: ['restaurant', 'wine_bar', 'park', 'movie_theater', 'garden'],
  productive: ['cafe', 'coffee_shop', 'library', 'book_store'],
  explorer: ['tourist_attraction', 'historical_landmark', 'market', 'art_gallery', 'park', 'plaza'],
  family: ['amusement_park', 'zoo', 'aquarium', 'park', 'playground', 'ice_cream_shop', 'movie_theater'],
}

export const ALL_MOODS = Object.keys(MOOD_CATEGORIES) as MoodType[]

export function isMood(value: string): value is MoodType {
  return (ALL_MOODS as string[]).includes(value)
}

/**
 * Rich vibe descriptor per mood — embedded once and used as the semantic target
 * the ranker scores each place against (§2.3). This is what makes "Focus" reject
 * a loud trattoria and prefer a quiet laptop-friendly café.
 */
export const MOOD_DESCRIPTORS: Record<MoodType, string> = {
  social:
    'a lively social night out with friends: buzzing bars, pubs and clubs, drinks, music, laughter and an energetic crowd',
  calm: 'a calm, relaxing and peaceful spot to unwind: cozy, quiet, slow, restorative, gentle and low-key',
  active:
    'an active, energetic place to move and get a workout: sports, gym, fitness, cycling, hiking and physical adventure',
  cultural:
    'a cultural experience of arts and ideas: museums, galleries, theaters, history and thoughtful, inspiring surroundings',
  romantic:
    'a romantic, intimate date-night setting: cozy, candlelit, charming, refined and perfect for two people',
  productive:
    'a focused, productive place to work or study: quiet, calm, laptop-friendly, good coffee, comfortable seating and few distractions',
  explorer:
    'exploring and discovering new hidden gems: local, novel, unique, offbeat and full of things to wander and find',
  family:
    'a family-friendly outing for all ages including kids: playful, safe, wholesome, relaxed and fun during the day',
}

/** Generic Google types that carry no real category signal. */
const GENERIC_TYPES = new Set([
  'point_of_interest',
  'establishment',
  'food',
  'store',
  'premise',
])

/**
 * Strict mood-appropriateness gate used in Stage-1 filtering. A place with a
 * SPECIFIC non-matching primary type (e.g. italian_restaurant for "productive")
 * is rejected; only when the primary type is generic/absent do we fall back to
 * the full type list. This kills category leaks.
 */
export function moodMatches(mood: MoodType, primary: string | null, types: string[]): boolean {
  const cats = new Set(MOOD_CATEGORIES[mood])
  if (primary && cats.has(primary)) return true
  if (!primary || GENERIC_TYPES.has(primary)) return types.some((t) => cats.has(t))
  return false
}

/**
 * Normalize a live Google category/type to a CategoryVibePrior key.
 * Falls back through the place's type list to the first key we have a prior for.
 */
export function normalizeCategory(primary: string | null, types: string[], knownKeys: Set<string>): string | null {
  const candidates = [primary, ...types].filter((t): t is string => !!t)
  for (const t of candidates) {
    if (knownKeys.has(t)) return t
  }
  return null
}
