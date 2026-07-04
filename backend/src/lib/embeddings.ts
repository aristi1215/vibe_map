/**
 * Request-time embeddings for recommendation ranking.
 *
 * Live Google content can't be persisted (see the geo-cell live-cache constraint),
 * so place embeddings — which are derived from Google content — are held ONLY in a
 * short-lived in-process RAM cache, never written to the DB. Interest/mood vectors
 * that are first-party (not derived from Google) may be persisted, but here we just
 * cache them in RAM too since they're small and stable.
 */
import { config } from '../config.js'
import type { Vec } from './vector.js'

const OPENAI_API_KEY = process.env.OPENAI_API_KEY

/** Raw batch embedding call (order-preserving). */
export async function embedTexts(texts: string[]): Promise<Vec[]> {
  if (texts.length === 0) return []
  if (!OPENAI_API_KEY) throw new Error('Missing OPENAI_API_KEY')
  const res = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({ model: config.embeddingModel, input: texts }),
  })
  if (!res.ok) {
    throw new Error(`OpenAI embeddings failed (${res.status}): ${await res.text()}`)
  }
  const json = (await res.json()) as { data: { index: number; embedding: number[] }[] }
  return json.data.sort((a, b) => a.index - b.index).map((d) => d.embedding)
}

/* ---------------- place embedding cache (RAM only) ---------------- */
interface PlaceEmbEntry {
  at: number
  vec: Vec
}
const placeEmbCache = new Map<string, PlaceEmbEntry>()

function prunePlaceCache(now: number, ttlMs: number): void {
  if (placeEmbCache.size < 2000) return
  for (const [k, e] of placeEmbCache) if (now - e.at >= ttlMs) placeEmbCache.delete(k)
}

/**
 * Embed a batch of places keyed by google place id, replaying RAM-cached vectors
 * and only calling the API for cache misses. Returns id → vector.
 */
export async function embedPlaces(
  items: { id: string; text: string }[],
): Promise<Map<string, Vec>> {
  const ttlMs = config.placeEmbTtlHours * 3_600_000
  const now = Date.now()
  prunePlaceCache(now, ttlMs)

  const out = new Map<string, Vec>()
  const misses: { id: string; text: string }[] = []
  for (const it of items) {
    const hit = placeEmbCache.get(it.id)
    if (hit && now - hit.at < ttlMs) out.set(it.id, hit.vec)
    else misses.push(it)
  }
  if (misses.length > 0) {
    const vecs = await embedTexts(misses.map((m) => m.text))
    misses.forEach((m, i) => {
      placeEmbCache.set(m.id, { at: now, vec: vecs[i] })
      out.set(m.id, vecs[i])
    })
  }
  return out
}

/* ---------------- small stable-text cache (moods etc.) ---------------- */
const textEmbCache = new Map<string, Vec>()

/** Embed a stable text once (e.g. a mood descriptor) and cache it for process life. */
export async function embedOnce(key: string, text: string): Promise<Vec> {
  const hit = textEmbCache.get(key)
  if (hit) return hit
  const [v] = await embedTexts([text])
  textEmbCache.set(key, v)
  return v
}
