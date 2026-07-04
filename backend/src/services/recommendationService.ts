import { supabase } from '../lib/supabase.js'
import { config } from '../config.js'
import {
  cosineSim,
  meanTopK,
  normalize,
  add,
  scale,
  parseVector,
  type Vec,
} from '../lib/vector.js'
import { haversineMeters } from '../lib/geocell.js'
import { fetchNearbyPlaces, type PlaceWithSkeleton } from './placesService.js'
import { MOOD_CATEGORIES, normalizeCategory } from './moodMapping.js'
import type { MoodType } from '../types/index.js'

export interface ScoredPlace extends PlaceWithSkeleton {
  score: number
  distanceMeters: number
}

/**
 * Two-stage recommendation flow (§2.3.1).
 * Stage 1 — hard filtering on live, ephemeral Google data (mood→category, distance, open now).
 * Stage 2 — embedding-based ranking using first-party vectors only.
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
    return haversineMeters(lat, lng, p.lat, p.lng) <= radiusMeters
  })
  if (candidates.length === 0) return []

  // ---- Stage 2: embedding-based ranking (first-party vectors only) ----
  const [priors, interests, learned, skeletons] = await Promise.all([
    loadCategoryPriors(),
    loadUserInterestVectors(userId),
    loadLearnedVector(userId, mood),
    loadSkeletonVectors(candidates.map((c) => c.placeId!)),
  ])

  const wLearned = learned ? learned.evidenceCount / (learned.evidenceCount + config.M) : 0

  const scored: ScoredPlace[] = []
  for (const candidate of candidates) {
    const placeVector = composePlaceVector(candidate, priors, skeletons)
    if (!placeVector) continue // no prior for this category and no behavioral signal → not rankable

    const explicitScore =
      interests.length > 0
        ? meanTopK(
            interests.map((tagVec) => cosineSim(placeVector, tagVec)),
            config.topKInterests,
          )
        : 0
    const learnedScore = learned ? cosineSim(placeVector, learned.vector) : 0
    const finalScore = (1 - wLearned) * explicitScore + wLearned * learnedScore

    scored.push({
      ...candidate,
      score: finalScore,
      distanceMeters: Math.round(haversineMeters(lat, lng, candidate.lat, candidate.lng)),
    })
  }

  scored.sort((a, b) => b.score - a.score)
  const top = scored.slice(0, config.recommendationLimit)

  await logRecommendations(userId, moodSessionId, top)
  return top
}

/**
 * place_vector composed at request time from first-party signals (§2.3.2):
 *   w_behavioral = evidence / (evidence + K)
 *   place_vector = normalize((1 - w) * category_prior + w * behavioral)
 */
function composePlaceVector(
  candidate: PlaceWithSkeleton,
  priors: Map<string, Vec>,
  skeletons: Map<string, { behavioral: Vec | null; evidenceCount: number }>,
): Vec | null {
  const prior = normalizeCategory(candidate.category, candidate.types, new Set(priors.keys()))
  const categoryPrior = prior ? priors.get(prior)! : null
  const skeleton = candidate.placeId ? skeletons.get(candidate.placeId) : undefined
  const behavioral = skeleton?.behavioral ?? null
  const evidenceCount = skeleton?.evidenceCount ?? 0

  if (!categoryPrior && !behavioral) return null
  if (!categoryPrior) return normalize(behavioral!)
  if (!behavioral || evidenceCount === 0) return normalize(categoryPrior)

  const w = evidenceCount / (evidenceCount + config.K)
  return normalize(add(scale(categoryPrior, 1 - w), scale(behavioral, w)))
}

async function loadCategoryPriors(): Promise<Map<string, Vec>> {
  const { data, error } = await supabase.from('category_vibe_prior').select('category_key, vector')
  if (error) throw error
  return new Map(
    (data ?? [])
      .map((r) => [r.category_key, parseVector(r.vector)] as const)
      .filter((entry): entry is [string, Vec] => entry[1] !== null),
  )
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

async function loadSkeletonVectors(
  placeIds: string[],
): Promise<Map<string, { behavioral: Vec | null; evidenceCount: number }>> {
  const { data, error } = await supabase
    .from('place')
    .select('id, behavioral_vector, behavioral_evidence_count')
    .in('id', placeIds)
  if (error) throw error
  return new Map(
    (data ?? []).map((r) => [
      r.id,
      { behavioral: parseVector(r.behavioral_vector), evidenceCount: r.behavioral_evidence_count },
    ]),
  )
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
