import type { MoodType } from './types'

export interface MoodMeta {
  id: MoodType
  label: string
  emoji: string
  /** primary accent hex — used for markers, glows, chips */
  color: string
  /** secondary hex for gradients */
  color2: string
  /** short vibe caption shown under the mood name */
  caption: string
}

/** CSS gradient string for a mood (135deg from → to). */
export const moodGradient = (m: MoodMeta): string =>
  `linear-gradient(135deg, ${m.color} 0%, ${m.color2} 100%)`

export const MOODS: MoodMeta[] = [
  { id: 'social', label: 'Social', emoji: '🎉', color: '#ff3d77', color2: '#ff8a3d', caption: 'out with the crowd' },
  { id: 'calm', label: 'Calm', emoji: '🌿', color: '#2dd4bf', color2: '#34d399', caption: 'slow & easy' },
  { id: 'active', label: 'Active', emoji: '⚡', color: '#ff7a1a', color2: '#ffd23d', caption: 'get moving' },
  { id: 'cultural', label: 'Cultural', emoji: '🎭', color: '#a855f7', color2: '#ec4899', caption: 'art & ideas' },
  { id: 'romantic', label: 'Romantic', emoji: '❤️', color: '#fb2576', color2: '#ff6b9d', caption: 'just the two of you' },
  { id: 'productive', label: 'Focus', emoji: '💻', color: '#3b82f6', color2: '#22d3ee', caption: 'heads-down' },
  { id: 'explorer', label: 'Explorer', emoji: '🧭', color: '#f59e0b', color2: '#fde047', caption: 'find something new' },
  { id: 'family', label: 'Family', emoji: '👨‍👩‍👧', color: '#22c55e', color2: '#a3e635', caption: 'all ages welcome' },
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
