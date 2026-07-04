import { moodById } from '../lib/moods'
import type { MoodType, ScoredPlace } from '../lib/types'

interface Props {
  mood: MoodType
  recommendations: ScoredPlace[]
  isLoading: boolean
  onPick: (place: ScoredPlace) => void
}

export function RecommendationsPanel({ mood, recommendations, isLoading, onPick }: Props) {
  const meta = moodById(mood)!
  return (
    <div className="pointer-events-auto flex max-h-[60vh] w-80 flex-col rounded-2xl border border-white/10 bg-zinc-900/90 shadow-2xl backdrop-blur-md">
      <div className="border-b border-white/10 px-5 py-3">
        <h3 className="font-bold text-white">
          {meta.emoji} {meta.label} picks for you
        </h3>
        <p className="text-[11px] text-zinc-500">
          Ranked by your interests + what you've loved before
        </p>
      </div>
      <div className="flex-1 overflow-y-auto p-3">
        {isLoading && <p className="px-2 py-4 text-sm text-zinc-400">Finding your vibe…</p>}
        {!isLoading && recommendations.length === 0 && (
          <p className="px-2 py-4 text-sm text-zinc-500">
            Nothing open nearby matches this mood right now — try zooming out or another mood.
          </p>
        )}
        <ul className="space-y-1.5">
          {recommendations.map((r, i) => (
            <li key={r.googlePlaceId}>
              <button
                onClick={() => onPick(r)}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-white/10"
              >
                <span
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold text-zinc-900"
                  style={{ backgroundColor: meta.color }}
                >
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-white">{r.name}</span>
                  <span className="block text-[11px] capitalize text-zinc-500">
                    {r.category?.split('_').join(' ')} ·{' '}
                    {r.distanceMeters < 1000
                      ? `${r.distanceMeters} m`
                      : `${(r.distanceMeters / 1000).toFixed(1)} km`}
                  </span>
                </span>
                <span className="text-xs font-semibold" style={{ color: meta.color }}>
                  {Math.round(r.score * 100)}%
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
