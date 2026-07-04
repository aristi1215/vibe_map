/** Pure vector math — no embedding API calls at request/feedback time (§2.3.2–2.3.4). */

export type Vec = number[]

export function zeros(dim: number): Vec {
  return new Array(dim).fill(0)
}

export function norm(v: Vec): number {
  return Math.sqrt(v.reduce((s, x) => s + x * x, 0))
}

export function normalize(v: Vec): Vec {
  const n = norm(v)
  if (n === 0) return v.slice()
  return v.map((x) => x / n)
}

export function add(a: Vec, b: Vec): Vec {
  return a.map((x, i) => x + b[i])
}

export function scale(v: Vec, s: number): Vec {
  return v.map((x) => x * s)
}

export function cosineSim(a: Vec, b: Vec): number {
  let dot = 0
  let na = 0
  let nb = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    na += a[i] * a[i]
    nb += b[i] * b[i]
  }
  if (na === 0 || nb === 0) return 0
  return dot / (Math.sqrt(na) * Math.sqrt(nb))
}

export function mean(vectors: Vec[]): Vec {
  if (vectors.length === 0) throw new Error('mean of empty vector set')
  let acc = zeros(vectors[0].length)
  for (const v of vectors) acc = add(acc, v)
  return scale(acc, 1 / vectors.length)
}

export function meanTopK(values: number[], k: number): number {
  if (values.length === 0) return 0
  const top = [...values].sort((a, b) => b - a).slice(0, k)
  return top.reduce((s, x) => s + x, 0) / top.length
}

/** pgvector column values arrive as strings like "[0.1,0.2,...]" */
export function parseVector(value: string | number[] | null): Vec | null {
  if (value == null) return null
  if (Array.isArray(value)) return value
  return JSON.parse(value) as Vec
}

/** Serialize for pgvector insert/update */
export function toVectorLiteral(v: Vec): string {
  return `[${v.join(',')}]`
}
