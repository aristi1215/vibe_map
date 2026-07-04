import { MOODS } from '../lib/moods'
import type { MoodType } from '../lib/types'

interface Props {
  active: MoodType | null
  onSelect: (mood: MoodType | null) => void
}

/** Horizontal, scrollable mood chip carousel (mobile-app style). */
export function MoodBar({ active, onSelect }: Props) {
  return (
    <div className="no-scrollbar pointer-events-auto flex w-full items-center gap-2 overflow-x-auto px-4 pb-1 pt-2">
      {MOODS.map((m) => {
        const isActive = active === m.id
        return (
          <button
            key={m.id}
            onClick={() => onSelect(isActive ? null : m.id)}
            className={`flex shrink-0 items-center gap-1.5 rounded-full border-2 px-4 py-2 text-sm font-bold shadow-sm transition-all ${
              isActive
                ? 'scale-105 border-transparent text-white shadow-md'
                : 'border-white bg-white/95 text-slate-600 hover:scale-105'
            }`}
            style={isActive ? { backgroundColor: m.color } : undefined}
          >
            <span>{m.emoji}</span>
            <span>{m.label}</span>
          </button>
        )
      })}
    </div>
  )
}
