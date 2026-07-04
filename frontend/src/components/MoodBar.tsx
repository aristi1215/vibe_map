import { MOODS } from '../lib/moods'
import type { MoodType } from '../lib/types'

interface Props {
  active: MoodType | null
  onSelect: (mood: MoodType | null) => void
}

export function MoodBar({ active, onSelect }: Props) {
  return (
    <div className="pointer-events-auto flex max-w-[92vw] items-center gap-1.5 overflow-x-auto rounded-2xl border border-white/10 bg-zinc-900/80 p-1.5 shadow-2xl backdrop-blur-md">
      {MOODS.map((m) => {
        const isActive = active === m.id
        return (
          <button
            key={m.id}
            onClick={() => onSelect(isActive ? null : m.id)}
            className={`flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-1.5 text-sm font-medium transition-all ${
              isActive
                ? 'text-zinc-900 shadow-lg'
                : 'text-zinc-300 hover:bg-white/10 hover:text-white'
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
