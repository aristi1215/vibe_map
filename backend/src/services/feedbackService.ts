import { supabase } from '../lib/supabase.js'
import { config } from '../config.js'
import {
  normalize,
  add,
  scale,
  mean,
  zeros,
  parseVector,
  toVectorLiteral,
  type Vec,
} from '../lib/vector.js'
import { getPlaceDetails } from './googlePlaces.js'
import { normalizeCategory } from './moodMapping.js'
import type { MoodType } from '../types/index.js'

/**
 * Two-sided, mood-scoped feedback loop (§2.3.4) — pure vector math, no
 * embedding-API calls at feedback time.
 */
export async function applyVisitFeedback(
  userId: string,
  placeId: string,
  mood: MoodType,
  alignmentRating: number,
): Promise<void> {
  const direction = alignmentRating >= 4 ? 1 : -1
  const alpha = direction > 0 ? config.alphaPositive : config.alphaNegative

  const placeVector = await composePlaceVectorForFeedback(placeId)
  if (!placeVector) return // place not rankable yet; nothing to learn from

  await updateUserMoodVector(userId, mood, placeVector, alpha, direction)

  if (direction > 0) {
    await updatePlaceBehavioralVector(userId, placeId)
  }
}

/** Same composition as §2.3.2, resolving the live category on demand. */
async function composePlaceVectorForFeedback(placeId: string): Promise<Vec | null> {
  const { data: place, error } = await supabase
    .from('place')
    .select('google_place_id, behavioral_vector, behavioral_evidence_count')
    .eq('id', placeId)
    .single()
  if (error) throw error

  const behavioral = parseVector(place.behavioral_vector)
  const evidenceCount = place.behavioral_evidence_count as number

  let categoryPrior: Vec | null = null
  try {
    const live = await getPlaceDetails(place.google_place_id)
    if (live) {
      const { data: priors } = await supabase.from('category_vibe_prior').select('category_key')
      const known = new Set((priors ?? []).map((p) => p.category_key))
      const key = normalizeCategory(live.category, live.types, known)
      if (key) {
        const { data: prior } = await supabase
          .from('category_vibe_prior')
          .select('vector')
          .eq('category_key', key)
          .single()
        categoryPrior = prior ? parseVector(prior.vector) : null
      }
    }
  } catch (err) {
    console.error('live category lookup failed during feedback:', err)
  }

  if (!categoryPrior && !behavioral) return null
  if (!categoryPrior) return normalize(behavioral!)
  if (!behavioral || evidenceCount === 0) return normalize(categoryPrior)
  const w = evidenceCount / (evidenceCount + config.K)
  return normalize(add(scale(categoryPrior, 1 - w), scale(behavioral, w)))
}

/** (1) Nudge the user's vector for THIS mood only — lazily created (§2.3.3–2.3.4). */
async function updateUserMoodVector(
  userId: string,
  mood: MoodType,
  placeVector: Vec,
  alpha: number,
  direction: 1 | -1,
): Promise<void> {
  const { data: existing, error } = await supabase
    .from('user_preference_vector')
    .select('id, vector, evidence_count')
    .eq('user_id', userId)
    .eq('mood_type', mood)
    .maybeSingle()
  if (error) throw error

  let current: Vec | null = existing ? parseVector(existing.vector) : null
  if (!current) {
    const { data: user } = await supabase
      .from('user')
      .select('base_preference_vector')
      .eq('id', userId)
      .single()
    current = parseVector(user?.base_preference_vector ?? null)
  }
  if (!current) current = placeVector // first-ever signal: seed from the place itself

  const updated = normalize(add(scale(current, 1 - alpha), scale(placeVector, alpha * direction)))

  const { error: upsertError } = await supabase.from('user_preference_vector').upsert(
    {
      user_id: userId,
      mood_type: mood,
      vector: toVectorLiteral(updated),
      evidence_count: (existing?.evidence_count ?? 0) + 1,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,mood_type' },
  )
  if (upsertError) throw upsertError
}

/** (2) Accrete the place's behavioral vector toward the rater's taste — positive feedback only. */
async function updatePlaceBehavioralVector(userId: string, placeId: string): Promise<void> {
  const { data: interests, error } = await supabase
    .from('user_interest')
    .select('interest_vocabulary(vector)')
    .eq('user_id', userId)
  if (error) throw error

  const tagVectors: Vec[] = []
  for (const row of interests ?? []) {
    const vocab = row.interest_vocabulary as unknown as { vector: string } | null
    const v = vocab ? parseVector(vocab.vector) : null
    if (v) tagVectors.push(v)
  }
  if (tagVectors.length === 0) return

  const raterTaste = normalize(mean(tagVectors))

  const { data: place, error: placeError } = await supabase
    .from('place')
    .select('behavioral_vector, behavioral_evidence_count')
    .eq('id', placeId)
    .single()
  if (placeError) throw placeError

  const evidence = place.behavioral_evidence_count as number
  const beta = 1 / (evidence + 1)
  const current = parseVector(place.behavioral_vector) ?? zeros(config.embeddingDim)
  const updated = normalize(add(scale(current, 1 - beta), scale(raterTaste, beta)))

  const { error: updateError } = await supabase
    .from('place')
    .update({
      behavioral_vector: toVectorLiteral(updated),
      behavioral_evidence_count: evidence + 1,
      last_signal_at: new Date().toISOString(),
    })
    .eq('id', placeId)
  if (updateError) throw updateError
}
