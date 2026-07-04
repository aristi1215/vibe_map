import { supabase } from '../lib/supabase.js'
import { config } from '../config.js'
import { cosineSim, meanTopK, parseVector, type Vec } from '../lib/vector.js'
import { haversineMeters } from '../lib/geocell.js'
import { embedOnce, embedPlaces } from '../lib/embeddings.js'
import { fetchNearbyPlaces, type PlaceWithSkeleton } from './placesService.js'
import { MOOD_CATEGORIES, MOOD_DESCRIPTORS, moodMatches } from './moodMapping.js'
import type { MoodType } from '../types/index.js'

export interface ScoredPlace extends PlaceWithSkeleton {
  score: number
  distanceMeters: number
}

/**
 * Two-stage recommendation flow (§2.3.1), rebuilt for real per-place accuracy.
 *
 * Stage 1 — hard filtering on live, ephemeral Google data: strict mood→category
 *   match (primary type), distance, open-now.
 * Stage 2 — request-time semantic ranking. Each surviving place is embedded from
 *   its real text (name + editorial summary + category) and scored on three
 *   min-max-normalized components: mood-vibe match, user-preference match
 *   (explicit interests + learned vector), and Google quality (rating × volume).
 *   Place embeddings live only in RAM (derived from Google content).
 */
export async function recommend(
  userId: string,
  mood: MoodType,
  lat: number,
  lng: number,
  radiusMeters: number,
  moodSessionId: string | null,
): Promise<ScoredPlace[]> {
  const categories = MOOD_CATEGORIES[mood]

  // Interest → category affinity comes first: it steers both WHAT gets fetched
  // and how candidates are ranked, so a "nightlife + dancing" user in a social
  // mood is supplied and scored toward night clubs — not the same popular
  // restaurants as everyone else.
  const [interests, priors, feedback] = await Promise.all([
    loadUserInterestVectors(userId),
    loadCategoryPriors(),
    loadPlaceFeedback(userId, mood),
  ])
  const catAffinity = new Map<string, number>()
  if (interests.length > 0) {
    for (const cat of categories) {
      const prior = priors.get(cat)
      if (prior)
        catAffinity.set(cat, meanTopK(interests.map((iv) => cosineSim(iv, prior)), config.topKInterests))
    }
  }
  const preferredCats = [...catAffinity.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, config.preferredCategoryCount)
    .map(([key]) => key)

  // ---- Stage 1: hard filtering (live, ephemeral) ----
  // Google returns ~20 popularity-ranked places per cell, so abundant categories
  // (restaurants) crowd rarer preferred ones (night clubs) out of the candidate
  // pool entirely. A second fetch restricted to the user's top-affinity
  // categories guarantees their kind of place is in the pool to be ranked.
  const fetches = [fetchNearbyPlaces(lat, lng, radiusMeters, categories)]
  if (preferredCats.length > 0 && preferredCats.length < categories.length) {
    fetches.push(fetchNearbyPlaces(lat, lng, radiusMeters, preferredCats))
  }
  const uniquePlaces = new Map<string, PlaceWithSkeleton>()
  for (const batch of await Promise.all(fetches)) {
    for (const p of batch) uniquePlaces.set(p.googlePlaceId, p)
  }
  const candidates = [...uniquePlaces.values()].filter((p) => {
    if (p.placeId === null) return false
    if (p.openNow === false) return false // unknown hours (null) are kept
    if (!moodMatches(mood, p.category, p.types)) return false
    const fb = feedback.get(p.placeId)
    if (fb && (fb.stronglyDisliked || (fb.latestForMood != null && fb.latestForMood <= config.dislikedRatingMax)))
      return false // the user told us they don't like this place — never resurface it
    return haversineMeters(lat, lng, p.lat, p.lng) <= radiusMeters
  })
  if (candidates.length === 0) return []

  // ---- Stage 2: semantic ranking ----
  const [moodVec, learned, placeEmbs] = await Promise.all([
    embedOnce(`mood:${mood}`, MOOD_DESCRIPTORS[mood]),
    loadLearnedVector(userId, mood),
    embedPlaces(candidates.map((c) => ({ id: c.googlePlaceId, text: placeText(c) }))),
  ])

  const hasPreference = interests.length > 0 || learned != null
  const wLearned = learned ? learned.evidenceCount / (learned.evidenceCount + config.M) : 0

  interface Raw {
    place: PlaceWithSkeleton
    vibe: number
    pref: number | null
    quality: number
  }
  const raw: Raw[] = []
  for (const c of candidates) {
    const emb = placeEmbs.get(c.googlePlaceId)
    if (!emb) continue

    const vibe = cosineSim(emb, moodVec)

    const textSim =
      interests.length > 0
        ? meanTopK(interests.map((iv) => cosineSim(emb, iv)), config.topKInterests)
        : null
    // Category affinity is the crisp half of the explicit signal — it cleanly
    // separates a night club from a restaurant where place-text similarity is fuzzy.
    const catKey = matchedMoodCategory(c, categories)
    const catAff = catKey != null ? (catAffinity.get(catKey) ?? null) : null
    let explicitSim: number | null
    if (textSim != null && catAff != null)
      explicitSim = (1 - config.categoryAffinityShare) * textSim + config.categoryAffinityShare * catAff
    else explicitSim = textSim ?? catAff

    const learnedSim = learned ? cosineSim(emb, learned.vector) : null
    let pref: number | null
    if (explicitSim != null && learnedSim != null) pref = (1 - wLearned) * explicitSim + wLearned * learnedSim
    else pref = explicitSim ?? learnedSim

    raw.push({ place: c, vibe, pref, quality: qualityScore(c.rating, c.userRatingCount) })
  }
  if (raw.length === 0) return []

  // Weights — redistribute the preference weight when the user has no signal yet.
  let wVibe = config.recWeights.vibe
  let wPref = config.recWeights.preference
  let wQual = config.recWeights.quality
  if (!hasPreference) {
    wVibe += wPref * 0.6
    wQual += wPref * 0.4
    wPref = 0
  }

  const vibeN = minMax(raw.map((r) => r.vibe))
  const prefN = minMax(raw.map((r) => r.pref))
  const qualN = minMax(raw.map((r) => r.quality))

  const scored: ScoredPlace[] = raw.map((r, i) => {
    let score = wVibe * vibeN[i] + wPref * prefN[i] + wQual * qualN[i]
    const fb = r.place.placeId ? feedback.get(r.place.placeId) : undefined
    if (fb?.latestForMood === 3) score *= config.mediocrePenalty // rated "meh" for this mood
    return {
      ...r.place,
      score,
      distanceMeters: Math.round(haversineMeters(lat, lng, r.place.lat, r.place.lng)),
    }
  })

  scored.sort((a, b) => b.score - a.score)
  const top = scored.slice(0, config.recommendationLimit)

  await logRecommendations(userId, moodSessionId, top)
  return top
}

/** Text an individual place is embedded from — the source of per-place differentiation. */
function placeText(p: PlaceWithSkeleton): string {
  const category = (p.category ?? p.types[0] ?? 'place').split('_').join(' ')
  return `${p.name}. ${p.editorialSummary ?? ''} Category: ${category}.`.replace(/\s+/g, ' ').trim()
}

/** Google rating × review-volume confidence, in [0,1]; neutral prior when unrated. */
function qualityScore(rating?: number | null, count?: number | null): number {
  if (rating == null) return 0.5
  const confidence = Math.min(1, Math.log10(1 + (count ?? 0)) / Math.log10(1 + 300))
  return (rating / 5) * (0.4 + 0.6 * confidence)
}

/** Min-max normalize to [0,1]; nulls and degenerate spreads map to a neutral 0.5. */
function minMax(values: (number | null)[]): number[] {
  const nums = values.filter((v): v is number => v != null)
  if (nums.length === 0) return values.map(() => 0.5)
  const min = Math.min(...nums)
  const max = Math.max(...nums)
  if (max - min < 1e-9) return values.map(() => 0.5)
  return values.map((v) => (v == null ? 0.5 : (v - min) / (max - min)))
}

/** The mood category a candidate matched Stage-1 filtering through. */
function matchedMoodCategory(p: PlaceWithSkeleton, categories: string[]): string | null {
  if (p.category && categories.includes(p.category)) return p.category
  return p.types.find((t) => categories.includes(t)) ?? null
}

/** category_vibe_prior vectors — seeded once, cached for process life. */
let categoryPriorCache: Map<string, Vec> | null = null
async function loadCategoryPriors(): Promise<Map<string, Vec>> {
  if (categoryPriorCache) return categoryPriorCache
  const { data, error } = await supabase.from('category_vibe_prior').select('category_key, vector')
  if (error) throw error
  const map = new Map<string, Vec>()
  for (const row of data ?? []) {
    const v = parseVector(row.vector)
    if (v) map.set(row.category_key, v)
  }
  categoryPriorCache = map
  return map
}

interface PlaceFeedback {
  /** latest alignment rating the user gave this place for the ACTIVE mood */
  latestForMood: number | null
  /** latest rating in ANY mood is 1 — "never show me this again" */
  stronglyDisliked: boolean
}

/**
 * The user's own verdicts, straight from their visit history. Vector nudges alone
 * are too weak to displace a popular place, so explicit dislikes become hard
 * exclusions: latest rating ≤ dislikedRatingMax for this mood hides it in this
 * mood; a latest rating of 1 in any mood hides it everywhere. Latest-wins, so a
 * later good rating restores the place.
 */
async function loadPlaceFeedback(userId: string, mood: MoodType): Promise<Map<string, PlaceFeedback>> {
  const { data, error } = await supabase
    .from('visit')
    .select('place_id, mood_at_visit, alignment_rating, visited_at')
    .eq('user_id', userId)
    .order('visited_at', { ascending: false })
    .limit(1000)
  if (error) throw error

  const seen = new Set<string>() // first row per (place, mood) is the latest visit
  const out = new Map<string, PlaceFeedback>()
  for (const row of data ?? []) {
    const key = `${row.place_id}|${row.mood_at_visit}`
    if (seen.has(key)) continue
    seen.add(key)
    const fb = out.get(row.place_id) ?? { latestForMood: null, stronglyDisliked: false }
    if (row.mood_at_visit === mood) fb.latestForMood = row.alignment_rating
    if (row.alignment_rating === 1) fb.stronglyDisliked = true
    out.set(row.place_id, fb)
  }
  return out
}

/** Explicit multi-modal interest set — never averaged into one point (§2.3.3). */
async function loadUserInterestVectors(userId: string): Promise<Vec[]> {
  const { data, error } = await supabase
    .from('user_interest')
    .select('tag, weight, interest_vocabulary(vector)')
    .eq('user_id', userId)
  if (error) throw error
  const vectors: Vec[] = []
  for (const row of data ?? []) {
    const vocab = row.interest_vocabulary as unknown as { vector: string } | null
    const v = vocab ? parseVector(vocab.vector) : null
    if (v) vectors.push(v)
  }
  return vectors
}

async function loadLearnedVector(
  userId: string,
  mood: MoodType,
): Promise<{ vector: Vec; evidenceCount: number } | null> {
  const { data, error } = await supabase
    .from('user_preference_vector')
    .select('vector, evidence_count')
    .eq('user_id', userId)
    .eq('mood_type', mood)
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  const vector = parseVector(data.vector)
  if (!vector) return null
  return { vector, evidenceCount: data.evidence_count }
}

async function logRecommendations(
  userId: string,
  moodSessionId: string | null,
  top: ScoredPlace[],
): Promise<void> {
  if (top.length === 0) return
  const rows = top.map((p) => ({
    user_id: userId,
    place_id: p.placeId!,
    mood_session_id: moodSessionId,
    score: p.score,
  }))
  const { error } = await supabase.from('recommendation').insert(rows)
  if (error) console.error('recommendation log insert failed:', error)
}
