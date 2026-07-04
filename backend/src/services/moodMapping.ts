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
