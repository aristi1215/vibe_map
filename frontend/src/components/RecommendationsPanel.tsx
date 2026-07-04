import { moodById } from '../lib/moods'
import type { MoodType, ScoredPlace } from '../lib/types'
import { IconClose, IconStar } from './icons'

interface Props {
  mood: MoodType
  recommendations: ScoredPlace[]
  isLoading: boolean
  onPick: (place: ScoredPlace) => void
  onClose: () => void
  selectedId?: string | null
}

const fmtDist = (m: number) => (m < 1000 ? `${m} m` : `${(m / 1000).toFixed(1)} km`)

export function RecommendationsPanel({
  mood,
  recommendations,
  isLoading,
  onPick,
  onClose,
  selectedId,
}: Props) {
  const meta = moodById(mood)!

  return (
    <div className="animate-float-in pointer-events-auto flex max-h-[calc(100vh-13rem)] w-[340px] flex-col overflow-hidden rounded-2.5xl panel shadow-panel">
      {/* header */}
      <div className="flex items-center justify-between border-b hairline px-4 py-3.5">
        <div className="flex items-center gap-2.5">
          <span
            className="flex h-9 w-9 items-center justify-center rounded-xl text-lg"
            style={{ background: meta.color }}
          >
            {meta.emoji}
          </span>
          <div>
            <h3 className="text-[15px] font-bold leading-tight text-white">Top {meta.label} picks</h3>
            <p className="text-[11px] text-white/40">matched to your taste · {meta.caption}</p>
          </div>
        </div>
        <button onClick={onClose} className="text-white/35 transition hover:text-white">
          <IconClose width={16} height={16} />
        </button>
      </div>

      <div className="thin-scroll flex-1 overflow-y-auto p-2">
        {isLoading && (
          <div className="space-y-2 p-1">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="skeleton h-16 rounded-xl" />
            ))}
          </div>
        )}

        {!isLoading && recommendations.length === 0 && (
          <div className="px-4 py-10 text-center">
            <p className="text-sm text-white/60">Nothing open nearby fits this vibe right now.</p>
            <p className="mt-1 text-xs text-white/35">Try zooming out or another mood.</p>
          </div>
        )}

        <ul className="space-y-1">
          {recommendations.map((r, i) => {
            const isSel = selectedId === r.googlePlaceId
            return (
              <li key={r.googlePlaceId}>
                <button
                  onClick={() => onPick(r)}
                  className={`flex w-full items-center gap-3 rounded-xl px-2.5 py-2.5 text-left transition-all ${
                    isSel ? 'bg-white/[0.09]' : 'hover:bg-white/[0.06]'
                  }`}
                >
                  <span
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[13px] font-bold text-white"
                    style={{ background: meta.color }}
                  >
                    {i + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] font-semibold text-white">
                      {r.name}
                    </span>
                    <span className="mt-0.5 flex items-center gap-1.5 text-[11px] text-white/45">
                      {r.rating != null && (
                        <span className="inline-flex items-center gap-0.5 text-amber-300/90">
                          {r.rating.toFixed(1)}
                          <IconStar width={10} height={10} />
                        </span>
                      )}
                      <span className="truncate capitalize">
                        {r.category?.split('_').join(' ') ?? 'place'}
                      </span>
                      <span className="text-white/25">·</span>
                      <span className="whitespace-nowrap">{fmtDist(r.distanceMeters)}</span>
                    </span>
                  </span>
                  <span
                    className="shrink-0 rounded-md px-1.5 py-1 text-[11px] font-bold"
                    style={{ background: `${meta.color}22`, color: meta.color2 }}
                  >
                    {Math.round(r.score * 100)}%
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}
