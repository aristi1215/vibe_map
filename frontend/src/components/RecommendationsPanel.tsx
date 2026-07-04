import { moodById } from '../lib/moods'
import type { MoodType, ScoredPlace } from '../lib/types'

interface Props {
  mood: MoodType
  recommendations: ScoredPlace[]
  isLoading: boolean
  onPick: (place: ScoredPlace) => void
}

/** Horizontal card carousel of mood-scoped picks, floating over the map. */
export function RecommendationsCarousel({ mood, recommendations, isLoading, onPick }: Props) {
  const meta = moodById(mood)!
  return (
    <div className="pointer-events-none w-full">
      <div className="px-4 pb-1">
        <span
          className="pointer-events-auto inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold text-white shadow-md"
          style={{ backgroundColor: meta.color }}
        >
          {meta.emoji} {meta.label} picks for you
        </span>
      </div>
      <div className="no-scrollbar pointer-events-auto flex w-full snap-x gap-3 overflow-x-auto px-4 pb-2 pt-1">
        {isLoading && (
          <div className="rounded-3xl bg-white/95 px-5 py-4 text-sm font-medium text-slate-500 shadow-lg">
            Finding your vibe…
          </div>
        )}
        {!isLoading && recommendations.length === 0 && (
          <div className="rounded-3xl bg-white/95 px-5 py-4 text-sm font-medium text-slate-500 shadow-lg">
            Nothing open nearby matches this mood — try zooming out or another mood.
          </div>
        )}
        {recommendations.map((r, i) => (
          <button
            key={r.googlePlaceId}
            onClick={() => onPick(r)}
            className="flex w-56 shrink-0 snap-start flex-col gap-1.5 rounded-3xl bg-white/95 p-4 text-left shadow-lg transition-transform hover:-translate-y-0.5"
          >
            <div className="flex items-center justify-between gap-2">
              <span
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-black text-white"
                style={{ backgroundColor: meta.color }}
              >
                {i + 1}
              </span>
              <span
                className="rounded-full px-2 py-0.5 text-xs font-black"
                style={{ color: meta.color, backgroundColor: `${meta.color}22` }}
              >
                {Math.round(r.score * 100)}% match
              </span>
            </div>
            <span className="mt-1 truncate text-sm font-bold text-slate-800">{r.name}</span>
            <span className="truncate text-xs capitalize text-slate-500">
              {r.category?.split('_').join(' ')} ·{' '}
              {r.distanceMeters < 1000
                ? `${r.distanceMeters} m`
                : `${(r.distanceMeters / 1000).toFixed(1)} km`}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}
