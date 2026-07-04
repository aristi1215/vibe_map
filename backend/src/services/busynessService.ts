import { supabase } from '../lib/supabase.js'
import { config } from '../config.js'
import type { BusynessLevel, BusynessSource } from '../types/index.js'

const LEVEL_VALUES: Record<BusynessLevel, number> = {
  empty: 0,
  calm: 1,
  moderate: 2,
  busy: 3,
  very_busy: 4,
}
const VALUE_LEVELS: BusynessLevel[] = ['empty', 'calm', 'moderate', 'busy', 'very_busy']

export interface BusynessResult {
  level: BusynessLevel | null
  source: BusynessSource
  uniqueReporters: number
  computedAt: string | null
}

/**
 * Hybrid, prioritized-source busyness (§2.4):
 *  1. ≥3 UNIQUE-user crowd reports in the last hour → recency-weighted average
 *  2. valid cached scraped value
 *  3. one scraping call if breaker closed + budget remains (disabled at launch)
 *  4. "insufficient data" — never fabricate
 */
export async function getBusyness(placeId: string): Promise<BusynessResult> {
  // 1. Crowdsourced
  const oneHourAgo = new Date(Date.now() - 60 * 60_000).toISOString()
  const { data: reports, error } = await supabase
    .from('crowd_report')
    .select('user_id, busyness_level, reported_at')
    .eq('place_id', placeId)
    .gte('reported_at', oneHourAgo)
  if (error) throw error

  const uniqueReporters = new Set((reports ?? []).map((r) => r.user_id)).size
  if (uniqueReporters >= config.minUniqueReporters) {
    const now = Date.now()
    let weightSum = 0
    let weightedTotal = 0
    for (const r of reports!) {
      const minutes = (now - new Date(r.reported_at).getTime()) / 60_000
      const weight = Math.exp(-minutes / config.busynessHalfLifeMinutes)
      weightSum += weight
      weightedTotal += weight * LEVEL_VALUES[r.busyness_level as BusynessLevel]
    }
    const level = VALUE_LEVELS[Math.min(4, Math.max(0, Math.round(weightedTotal / weightSum)))]
    const computedAt = new Date().toISOString()
    await cacheBusyness(placeId, level, 'crowdsourced', uniqueReporters, computedAt)
    return { level, source: 'crowdsourced', uniqueReporters, computedAt }
  }

  // 2. Valid cached scrape
  const { data: cached } = await supabase
    .from('place_busyness')
    .select('current_busyness_level, busyness_source, busyness_computed_at')
    .eq('place_id', placeId)
    .maybeSingle()
  if (
    cached?.busyness_source === 'scraped' &&
    cached.current_busyness_level &&
    cached.busyness_computed_at &&
    Date.now() - new Date(cached.busyness_computed_at).getTime() < config.scrapeTtlMinutes * 60_000
  ) {
    return {
      level: cached.current_busyness_level as BusynessLevel,
      source: 'scraped',
      uniqueReporters,
      computedAt: cached.busyness_computed_at,
    }
  }

  // 3. Scraping — disabled at launch (§2.4.3 note); record demand for prioritization
  if (config.scrapingEnabled) {
    const scraped = await tryScrape(placeId)
    if (scraped) return scraped
  }

  // 4. Insufficient data — never fabricate. Record demand signal for budget priority queue.
  const { error: rpcError } = await supabase.rpc('increment_demand_signal', {
    p_place_id: placeId,
  })
  if (rpcError) console.error('increment_demand_signal failed:', rpcError)
  return { level: null, source: 'insufficient_data', uniqueReporters, computedAt: null }
}

/**
 * Submit a crowd report. The DB enforces one report per (user, place, 15-min bucket).
 */
export async function submitCrowdReport(
  userId: string,
  placeId: string,
  level: BusynessLevel,
): Promise<{ ok: boolean; reason?: string }> {
  const { error } = await supabase
    .from('crowd_report')
    .insert({ user_id: userId, place_id: placeId, busyness_level: level })
  if (error) {
    if (error.code === '23505') {
      return { ok: false, reason: 'You already reported this place in the last 15 minutes' }
    }
    throw error
  }
  return { ok: true }
}

async function cacheBusyness(
  placeId: string,
  level: BusynessLevel,
  source: BusynessSource,
  uniqueReporters: number,
  computedAt: string,
): Promise<void> {
  await supabase.from('place_busyness').upsert(
    {
      place_id: placeId,
      current_busyness_level: level,
      busyness_source: source,
      unique_reporters_recent: uniqueReporters,
      busyness_computed_at: computedAt,
      updated_at: computedAt,
    },
    { onConflict: 'place_id' },
  )
}

/**
 * Scraping fallback stub with budget + circuit breaker bookkeeping (§2.4.3).
 * No scraping provider is wired at launch; the breaker/budget plumbing is kept
 * so a licensed provider (BestTime, Foursquare) can be dropped in.
 */
async function tryScrape(placeId: string): Promise<BusynessResult | null> {
  const today = new Date().toISOString().slice(0, 10)
  const { data: budget } = await supabase
    .from('scraping_budget')
    .select('id, calls_made, daily_limit, circuit_breaker_status')
    .eq('date', today)
    .maybeSingle()

  const row =
    budget ??
    (
      await supabase
        .from('scraping_budget')
        .upsert({ date: today, daily_limit: config.scrapingDailyLimit }, { onConflict: 'date' })
        .select('id, calls_made, daily_limit, circuit_breaker_status')
        .single()
    ).data

  if (!row || row.circuit_breaker_status === 'open' || row.calls_made >= row.daily_limit) {
    return null
  }

  await supabase
    .from('scraping_budget')
    .update({ calls_made: row.calls_made + 1 })
    .eq('id', row.id)

  // Provider integration point — returns null (no data) until a provider is licensed.
  void placeId
  return null
}
