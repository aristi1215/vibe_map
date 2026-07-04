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
  // ---- Stage 1: hard filtering (live, ephemeral) ----
  const categories = MOOD_CATEGORIES[mood]
  const places = await fetchNearbyPlaces(lat, lng, radiusMeters, categories)
  const candidates = places.filter((p) => {
    if (p.placeId === null) return false
    if (p.openNow === false) return false // unknown hours (null) are kept
    if (!moodMatches(mood, p.category, p.types)) return false
    return haversineMeters(lat, lng, p.lat, p.lng) <= radiusMeters
  })
  if (candidates.length === 0) return []

  // ---- Stage 2: semantic ranking ----
  const [moodVec, interests, learned, placeEmbs] = await Promise.all([
    embedOnce(`mood:${mood}`, MOOD_DESCRIPTORS[mood]),
    loadUserInterestVectors(userId),
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

    const interestSim =
      interests.length > 0
        ? meanTopK(interests.map((iv) => cosineSim(emb, iv)), config.topKInterests)
        : null
    const learnedSim = learned ? cosineSim(emb, learned.vector) : null
    let pref: number | null
    if (interestSim != null && learnedSim != null) pref = (1 - wLearned) * interestSim + wLearned * learnedSim
    else pref = interestSim ?? learnedSim

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

  const scored: ScoredPlace[] = raw.map((r, i) => ({
    ...r.place,
    score: wVibe * vibeN[i] + wPref * prefN[i] + wQual * qualN[i],
    distanceMeters: Math.round(haversineMeters(lat, lng, r.place.lat, r.place.lng)),
  }))

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
