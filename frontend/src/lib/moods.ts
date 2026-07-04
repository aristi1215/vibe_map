import type { MoodType } from './types'

export interface MoodMeta {
  id: MoodType
  label: string
  emoji: string
  /** tailwind-safe hex accents used for markers + chips */
  color: string
}

export const MOODS: MoodMeta[] = [
  { id: 'social', label: 'Social', emoji: '🎉', color: '#f472b6' },
  { id: 'calm', label: 'Calm', emoji: '🌿', color: '#34d399' },
  { id: 'active', label: 'Active', emoji: '⚡', color: '#fb923c' },
  { id: 'cultural', label: 'Cultural', emoji: '🎭', color: '#a78bfa' },
  { id: 'romantic', label: 'Romantic', emoji: '❤️', color: '#fb7185' },
  { id: 'productive', label: 'Productive', emoji: '💻', color: '#38bdf8' },
  { id: 'explorer', label: 'Explorer', emoji: '🧭', color: '#facc15' },
  { id: 'family', label: 'Family', emoji: '👨‍👩‍👧', color: '#4ade80' },
]

export const moodById = (id: MoodType | null | undefined): MoodMeta | undefined =>
  MOODS.find((m) => m.id === id)

export const BUSYNESS_LABELS: Record<string, string> = {
  empty: 'Empty',
  calm: 'Quiet',
  moderate: 'Moderate',
  busy: 'Busy',
  very_busy: 'Packed',
}
