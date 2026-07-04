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

export function PlaceDetailPanel({ place, activeMood, onClose, onShare }: Props) {
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
    <div className="pointer-events-auto flex w-80 flex-col gap-4 rounded-2xl border border-white/10 bg-zinc-900/90 p-5 shadow-2xl backdrop-blur-md">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-lg font-bold leading-tight text-white">{place.name}</h3>
          <p className="mt-0.5 text-xs capitalize text-zinc-400">
            {place.category?.split('_').join(' ')}
            {place.address ? ` · ${place.address}` : ''}
          </p>
        </div>
        <button onClick={onClose} className="text-zinc-500 hover:text-white">
          ✕
        </button>
      </div>

      <div className="flex items-center gap-2 text-sm">
        {place.openNow != null && (
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
              place.openNow ? 'bg-emerald-500/20 text-emerald-300' : 'bg-rose-500/20 text-rose-300'
            }`}
          >
            {place.openNow ? 'Open now' : 'Closed'}
          </span>
        )}
        {typeof place.distanceMeters === 'number' && (
          <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-xs text-zinc-300">
            {place.distanceMeters < 1000
              ? `${place.distanceMeters} m`
              : `${(place.distanceMeters / 1000).toFixed(1)} km`}
          </span>
        )}
        {typeof place.score === 'number' && mood && (
          <span
            className="rounded-full px-2.5 py-0.5 text-xs font-medium text-zinc-900"
            style={{ backgroundColor: mood.color }}
          >
            {Math.round(place.score * 100)}% {mood.label.toLowerCase()} match
          </span>
        )}
      </div>

      <div className="rounded-xl bg-white/5 p-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
            Busyness
          </span>
          {busyness.data?.source === 'crowdsourced' && (
            <span className="text-[10px] text-zinc-500">
              {busyness.data.uniqueReporters} reports · last hour
            </span>
          )}
        </div>
        <p className="mt-1 text-sm text-white">
          {busyness.isLoading
            ? 'Checking…'
            : busyness.data?.level
              ? BUSYNESS_LABELS[busyness.data.level]
              : 'Not enough data yet'}
        </p>
        <div className="mt-2">
          <p className="text-[11px] text-zinc-500">Are you here? Report it:</p>
          <div className="mt-1 flex gap-1">
            {REPORT_LEVELS.map((level) => (
              <button
                key={level}
                onClick={() => report.mutate(level)}
                disabled={report.isPending}
                className="flex-1 rounded-lg bg-white/10 px-1 py-1 text-[10px] text-zinc-300 transition-colors hover:bg-white/20"
                title={BUSYNESS_LABELS[level]}
              >
                {BUSYNESS_LABELS[level]}
              </button>
            ))}
          </div>
          {report.isError && (
            <p className="mt-1 text-[11px] text-amber-400">{(report.error as Error).message}</p>
          )}
          {report.isSuccess && <p className="mt-1 text-[11px] text-emerald-400">Thanks!</p>}
        </div>
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => onShare(place, 'im_here')}
          className="flex-1 rounded-xl bg-white/10 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-white/20"
        >
          📍 I'm here
        </button>
        <button
          onClick={() => onShare(place, 'intent_to_go')}
          className="flex-1 rounded-xl bg-white/10 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-white/20"
        >
          🚶 Heading there
        </button>
      </div>

      {activeMood && place.placeId && (
        <div className="rounded-xl bg-white/5 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
            Visited? Rate the vibe match
          </p>
          {rateVisit.isSuccess ? (
            <p className="mt-2 text-sm text-emerald-400">
              Got it — your {mood?.label.toLowerCase()} recommendations just got smarter.
            </p>
          ) : (
            <div className="mt-1.5 flex gap-1">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  onMouseEnter={() => setRating(star)}
                  onMouseLeave={() => setRating(0)}
                  onClick={() => rateVisit.mutate(star)}
                  disabled={rateVisit.isPending}
                  className={`text-xl transition-transform hover:scale-110 ${
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
  )
}
