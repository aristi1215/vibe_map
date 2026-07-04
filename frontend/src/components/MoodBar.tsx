import { MOODS } from '../lib/moods'
import type { MoodType } from '../lib/types'

interface Props {
  active: MoodType | null
  onSelect: (mood: MoodType | null) => void
}

/**
 * Bottom mood selector — the primary control. The active mood fills with its
 * (single, solid) accent color; the rest stay quiet. Tapping the active mood
 * again clears it.
 */
export function MoodBar({ active, onSelect }: Props) {
  return (
    <div className="pointer-events-auto w-full max-w-[640px]">
      <div className="no-scrollbar flex items-center gap-1.5 overflow-x-auto rounded-2xl panel p-1.5 shadow-panel">
        {MOODS.map((m) => {
          const isActive = active === m.id
          return (
            <button
              key={m.id}
              onClick={() => onSelect(isActive ? null : m.id)}
              title={m.caption}
              className={`flex shrink-0 items-center gap-1.5 rounded-xl px-3.5 py-2 text-[13px] font-semibold transition-all duration-150 ${
                isActive ? 'text-white' : 'text-white/60 hover:bg-white/[0.07] hover:text-white'
              }`}
              style={
                isActive
                  ? { background: m.color, boxShadow: `0 6px 20px -8px ${m.color}` }
                  : undefined
              }
            >
              <span className="text-[15px] leading-none">{m.emoji}</span>
              <span>{m.label}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
