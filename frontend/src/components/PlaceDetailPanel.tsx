import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { BUSYNESS_LABELS, moodById } from '../lib/moods'
import type { BusynessLevel, BusynessResult, LivePlace, MoodType } from '../lib/types'

interface Props {
  place: LivePlace & { score?: number; distanceMeters?: number }
  activeMood: MoodType | null
  onClose: () => void
  onShare: (place: LivePlace, type: 'im_here' | 'intent_to_go') => void
}

const REPORT_LEVELS: BusynessLevel[] = ['empty', 'calm', 'moderate', 'busy', 'very_busy']

/** Bottom-sheet place details: live status, busyness + reporting, sharing, rating. */
export function PlaceDetailSheet({ place, activeMood, onClose, onShare }: Props) {
  const queryClient = useQueryClient()
  const [rating, setRating] = useState(0)
  const mood = moodById(activeMood)

  const busyness = useQuery({
    queryKey: ['busyness', place.placeId],
    queryFn: () => api<BusynessResult>(`/api/busyness/${place.placeId}`),
    enabled: !!place.placeId,
    staleTime: 60_000,
  })

  const report = useMutation({
    mutationFn: (level: BusynessLevel) =>
      api(`/api/busyness/${place.placeId}/report`, {
        method: 'POST',
        body: JSON.stringify({ level }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['busyness', place.placeId] }),
  })

  const rateVisit = useMutation({
    mutationFn: (value: number) =>
      api('/api/visits', {
        method: 'POST',
        body: JSON.stringify({ placeId: place.placeId, mood: activeMood, rating: value }),
      }),
  })

  return (
    <div className="animate-sheet-up pointer-events-auto mx-auto w-full max-w-lg rounded-t-[2rem] bg-white shadow-[0_-8px_40px_rgba(0,0,0,0.15)]">
      <div className="flex justify-center pt-3">
        <span className="h-1.5 w-12 rounded-full bg-slate-200" />
      </div>
      <div className="max-h-[55vh] space-y-4 overflow-y-auto px-6 pb-6 pt-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-xl font-extrabold leading-tight text-slate-900">{place.name}</h3>
            <p className="mt-1 text-xs capitalize text-slate-500">
              {place.category?.split('_').join(' ')}
              {place.address ? ` · ${place.address}` : ''}
            </p>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200"
          >
            ✕
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-sm">
          {place.openNow != null && (
            <span
              className={`rounded-full px-3 py-1 text-xs font-bold ${
                place.openNow ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
              }`}
            >
              {place.openNow ? 'Open now' : 'Closed'}
            </span>
          )}
          {typeof place.distanceMeters === 'number' && (
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">
              {place.distanceMeters < 1000
                ? `${place.distanceMeters} m`
                : `${(place.distanceMeters / 1000).toFixed(1)} km`}
            </span>
          )}
          {typeof place.score === 'number' && mood && (
            <span
              className="rounded-full px-3 py-1 text-xs font-bold text-white"
              style={{ backgroundColor: mood.color }}
            >
              {Math.round(place.score * 100)}% {mood.label.toLowerCase()} match
            </span>
          )}
        </div>

        <div className="rounded-2xl bg-orange-50 p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-extrabold uppercase tracking-wide text-orange-400">
              Busyness
            </span>
            {busyness.data?.source === 'crowdsourced' && (
              <span className="text-[10px] font-medium text-slate-400">
                {busyness.data.uniqueReporters} reports · last hour
              </span>
            )}
          </div>
          <p className="mt-1 text-base font-bold text-slate-800">
            {busyness.isLoading
              ? 'Checking…'
              : busyness.data?.level
                ? BUSYNESS_LABELS[busyness.data.level]
                : 'Not enough data yet'}
          </p>
          <div className="mt-2">
            <p className="text-[11px] font-medium text-slate-500">Are you here? Report it:</p>
            <div className="mt-1.5 flex gap-1.5">
              {REPORT_LEVELS.map((level) => (
                <button
                  key={level}
                  onClick={() => report.mutate(level)}
                  disabled={report.isPending}
                  className="flex-1 rounded-full bg-white px-1 py-1.5 text-[10px] font-bold text-slate-600 shadow-sm transition-colors hover:bg-orange-100"
                  title={BUSYNESS_LABELS[level]}
                >
                  {BUSYNESS_LABELS[level]}
                </button>
              ))}
            </div>
            {report.isError && (
              <p className="mt-1.5 text-[11px] font-medium text-amber-600">
                {(report.error as Error).message}
              </p>
            )}
            {report.isSuccess && (
              <p className="mt-1.5 text-[11px] font-bold text-emerald-600">Thanks!</p>
            )}
          </div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => onShare(place, 'im_here')}
            className="flex-1 rounded-full bg-gradient-to-r from-orange-400 to-pink-500 px-3 py-3 text-sm font-bold text-white shadow-md transition-transform hover:scale-[1.02]"
          >
            📍 I'm here
          </button>
          <button
            onClick={() => onShare(place, 'intent_to_go')}
            className="flex-1 rounded-full bg-gradient-to-r from-sky-400 to-indigo-500 px-3 py-3 text-sm font-bold text-white shadow-md transition-transform hover:scale-[1.02]"
          >
            🚶 Heading there
          </button>
        </div>

        {activeMood && place.placeId && (
          <div className="rounded-2xl bg-violet-50 p-4">
            <p className="text-xs font-extrabold uppercase tracking-wide text-violet-400">
              Visited? Rate the vibe match
            </p>
            {rateVisit.isSuccess ? (
              <p className="mt-2 text-sm font-bold text-emerald-600">
                Got it — your {mood?.label.toLowerCase()} recommendations just got smarter.
              </p>
            ) : (
              <div className="mt-2 flex gap-1.5">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    onMouseEnter={() => setRating(star)}
                    onMouseLeave={() => setRating(0)}
                    onClick={() => rateVisit.mutate(star)}
                    disabled={rateVisit.isPending}
                    className={`text-2xl transition-transform hover:scale-125 ${
                      star <= rating ? 'grayscale-0' : 'grayscale'
                    }`}
                  >
                    ⭐
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
