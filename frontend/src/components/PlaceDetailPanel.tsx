import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { BUSYNESS_LABELS, moodById } from '../lib/moods'
import type {
  BusynessLevel,
  BusynessResult,
  LivePlace,
  MoodType,
  RichPlaceDetails,
} from '../lib/types'
import { IconClose, IconNav, IconGlobe, IconPhone, IconStar, IconClock, IconChevron } from './icons'

interface Props {
  place: LivePlace & { score?: number; distanceMeters?: number }
  activeMood: MoodType | null
  onClose: () => void
  onShare: (place: LivePlace, type: 'im_here' | 'intent_to_go') => void
}

const REPORT_LEVELS: BusynessLevel[] = ['empty', 'calm', 'moderate', 'busy', 'very_busy']
const fmtDist = (m: number) => (m < 1000 ? `${m} m` : `${(m / 1000).toFixed(1)} km`)

const PRICE: Record<string, number> = {
  PRICE_LEVEL_FREE: 0,
  PRICE_LEVEL_INEXPENSIVE: 1,
  PRICE_LEVEL_MODERATE: 2,
  PRICE_LEVEL_EXPENSIVE: 3,
  PRICE_LEVEL_VERY_EXPENSIVE: 4,
}
const priceStr = (p?: string | null) => (p && p in PRICE ? '$'.repeat(PRICE[p]) || 'Free' : null)

export function PlaceDetailPanel({ place, activeMood, onClose, onShare }: Props) {
  const queryClient = useQueryClient()
  const [rating, setRating] = useState(0)
  const [hoursOpen, setHoursOpen] = useState(false)
  const mood = moodById(activeMood)

  const details = useQuery({
    queryKey: ['place-details', place.googlePlaceId],
    queryFn: () => api<RichPlaceDetails>(`/api/places/details/${place.googlePlaceId}`),
    staleTime: 5 * 60_000,
  })
  const d = details.data
  const placeId = place.placeId ?? d?.placeId ?? null

  const busyness = useQuery({
    queryKey: ['busyness', placeId],
    queryFn: () => api<BusynessResult>(`/api/busyness/${placeId}`),
    enabled: !!placeId,
    staleTime: 60_000,
  })

  const report = useMutation({
    mutationFn: (level: BusynessLevel) =>
      api(`/api/busyness/${placeId}/report`, { method: 'POST', body: JSON.stringify({ level }) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['busyness', placeId] }),
  })

  const rateVisit = useMutation({
    mutationFn: (value: number) =>
      api('/api/visits', {
        method: 'POST',
        body: JSON.stringify({ placeId, mood: activeMood, rating: value }),
      }),
  })

  const rat = d?.rating ?? place.rating ?? null
  const ratCount = d?.userRatingCount ?? place.userRatingCount ?? null
  const price = priceStr(d?.priceLevel ?? place.priceLevel)
  const openNow = d?.openNow ?? place.openNow
  const category = (d?.category ?? place.category)?.split('_').join(' ')

  return (
    <div className="animate-float-in pointer-events-auto flex max-h-[calc(100vh-8rem)] w-[380px] flex-col overflow-hidden rounded-2.5xl panel shadow-panel">
      {/* photo header */}
      <div className="relative">
        {details.isLoading ? (
          <div className="skeleton h-44 w-full" />
        ) : d && d.photoUrls.length > 0 ? (
          <div className="no-scrollbar flex h-44 snap-x snap-mandatory overflow-x-auto">
            {d.photoUrls.map((url, i) => (
              <img
                key={i}
                src={url}
                alt={`${d.name} ${i + 1}`}
                loading="lazy"
                className="h-44 w-full shrink-0 snap-center object-cover"
                style={{ minWidth: '100%' }}
              />
            ))}
          </div>
        ) : (
          <div className="flex h-28 w-full items-center justify-center bg-white/[0.03] text-4xl">
            🗺️
          </div>
        )}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-black/50 to-transparent" />
        <button
          onClick={onClose}
          className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-black/45 text-white/90 backdrop-blur transition hover:bg-black/70"
        >
          <IconClose width={16} height={16} />
        </button>
      </div>

      <div className="thin-scroll flex-1 overflow-y-auto">
        <div className="space-y-4 p-5">
          {/* title + meta */}
          <div>
            <h3 className="text-xl font-bold leading-tight text-white">{place.name}</h3>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-white/55">
              {rat != null && (
                <span className="inline-flex items-center gap-1 font-semibold text-amber-300">
                  {rat.toFixed(1)}
                  <IconStar width={13} height={13} />
                  {ratCount != null && (
                    <span className="font-normal text-white/45">({ratCount.toLocaleString()})</span>
                  )}
                </span>
              )}
              {price && <span className="text-white/45">· {price}</span>}
              {category && <span className="capitalize text-white/55">· {category}</span>}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {openNow != null && (
                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                    openNow ? 'bg-emerald-500/15 text-emerald-300' : 'bg-rose-500/15 text-rose-300'
                  }`}
                >
                  {openNow ? 'Open now' : 'Closed'}
                </span>
              )}
              {typeof place.distanceMeters === 'number' && (
                <span className="rounded-full tile px-2.5 py-1 text-xs text-white/65">
                  {fmtDist(place.distanceMeters)} away
                </span>
              )}
              {typeof place.score === 'number' && mood && (
                <span
                  className="rounded-full px-2.5 py-1 text-xs font-semibold text-white"
                  style={{ background: mood.color }}
                >
                  {Math.round(place.score * 100)}% {mood.label.toLowerCase()} match
                </span>
              )}
            </div>
          </div>

          {/* actions */}
          <div className="grid grid-cols-3 gap-2">
            <ActionBtn
              href={d?.googleMapsUri ?? `https://www.google.com/maps/search/?api=1&query=${place.lat},${place.lng}`}
              label="Directions"
              icon={<IconNav width={17} height={17} />}
              primary
            />
            <ActionBtn href={d?.website ?? undefined} label="Website" icon={<IconGlobe width={17} height={17} />} />
            <ActionBtn href={d?.phone ? `tel:${d.phone}` : undefined} label="Call" icon={<IconPhone width={17} height={17} />} />
          </div>

          {/* about */}
          {d?.editorialSummary && (
            <p className="text-[13px] leading-relaxed text-white/70">{d.editorialSummary}</p>
          )}
          {d?.formattedAddress && (
            <p className="text-[12px] leading-relaxed text-white/45">{d.formattedAddress}</p>
          )}

          {/* hours */}
          {d && d.weekdayDescriptions.length > 0 && (
            <div className="tile rounded-xl">
              <button
                onClick={() => setHoursOpen((v) => !v)}
                className="flex w-full items-center gap-2 px-3.5 py-2.5 text-left"
              >
                <IconClock width={15} height={15} className="text-white/45" />
                <span className="flex-1 text-[13px] font-medium text-white/80">Opening hours</span>
                <IconChevron
                  width={15}
                  height={15}
                  className={`text-white/40 transition-transform ${hoursOpen ? 'rotate-90' : ''}`}
                />
              </button>
              {hoursOpen && (
                <ul className="space-y-1 px-3.5 pb-3 text-[12px] text-white/55">
                  {d.weekdayDescriptions.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* busyness */}
          <div className="tile rounded-xl p-3.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-white/40">
                How busy
              </span>
              {busyness.data?.source === 'crowdsourced' && (
                <span className="text-[10px] text-white/35">
                  {busyness.data.uniqueReporters} reports · last hour
                </span>
              )}
            </div>
            <p className="mt-1 text-sm font-medium text-white">
              {busyness.isLoading
                ? 'Checking…'
                : busyness.data?.level
                  ? BUSYNESS_LABELS[busyness.data.level]
                  : 'Not enough data yet'}
            </p>
            <p className="mt-2 text-[11px] text-white/40">Here now? Drop a live report:</p>
            <div className="mt-1.5 flex gap-1">
              {REPORT_LEVELS.map((level) => (
                <button
                  key={level}
                  onClick={() => report.mutate(level)}
                  disabled={report.isPending || !placeId}
                  className="flex-1 rounded-lg bg-white/[0.06] px-1 py-1.5 text-[10px] font-medium text-white/65 transition-colors hover:bg-white/[0.12] hover:text-white disabled:opacity-40"
                >
                  {BUSYNESS_LABELS[level]}
                </button>
              ))}
            </div>
            {report.isSuccess && <p className="mt-1 text-[11px] text-emerald-400">Thanks!</p>}
          </div>

          {/* share */}
          <div className="flex gap-2">
            <button
              onClick={() => onShare(place, 'im_here')}
              className="flex-1 rounded-xl bg-white/[0.06] px-3 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-white/[0.12]"
            >
              I'm here
            </button>
            <button
              onClick={() => onShare(place, 'intent_to_go')}
              className="flex-1 rounded-xl bg-white/[0.06] px-3 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-white/[0.12]"
            >
              Heading there
            </button>
          </div>

          {/* rate */}
          {activeMood && placeId && (
            <div className="tile rounded-xl p-3.5">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-white/40">
                Been here? Rate the {mood?.label.toLowerCase()} match
              </p>
              {rateVisit.isSuccess ? (
                <p className="mt-2 text-sm text-emerald-400">
                  Thanks — your picks just got smarter.
                </p>
              ) : (
                <div className="mt-1.5 flex gap-1.5">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      onMouseEnter={() => setRating(star)}
                      onMouseLeave={() => setRating(0)}
                      onClick={() => rateVisit.mutate(star)}
                      disabled={rateVisit.isPending}
                      className={`transition-transform hover:scale-110 ${
                        star <= rating ? 'text-amber-300' : 'text-white/20'
                      }`}
                    >
                      <IconStar width={22} height={22} />
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* reviews */}
          {d && d.reviews.length > 0 && (
            <div>
              <h4 className="text-[11px] font-semibold uppercase tracking-wide text-white/40">
                Reviews
              </h4>
              <ul className="mt-2 space-y-2.5">
                {d.reviews.map((r, i) => (
                  <li key={i} className="tile rounded-xl p-3">
                    <div className="flex items-center gap-2">
                      {r.authorPhoto ? (
                        <img src={r.authorPhoto} alt="" className="h-6 w-6 rounded-full object-cover" />
                      ) : (
                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/10 text-[10px]">
                          {r.author?.[0] ?? '?'}
                        </span>
                      )}
                      <span className="truncate text-[12px] font-medium text-white/80">
                        {r.author ?? 'Anonymous'}
                      </span>
                      {r.rating != null && (
                        <span className="ml-auto inline-flex items-center gap-0.5 text-[11px] font-semibold text-amber-300">
                          {r.rating}
                          <IconStar width={11} height={11} />
                        </span>
                      )}
                    </div>
                    {r.text && (
                      <p className="mt-1.5 line-clamp-4 text-[12px] leading-relaxed text-white/60">
                        {r.text}
                      </p>
                    )}
                    {r.relativeTime && (
                      <p className="mt-1 text-[10px] text-white/30">{r.relativeTime}</p>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function ActionBtn({
  href,
  label,
  icon,
  primary,
}: {
  href?: string
  label: string
  icon: React.ReactNode
  primary?: boolean
}) {
  const disabled = !href
  const cls = `flex flex-col items-center justify-center gap-1 rounded-xl px-2 py-2.5 text-[11px] font-semibold transition ${
    primary
      ? 'btn-accent'
      : disabled
        ? 'tile cursor-not-allowed text-white/25'
        : 'tile text-white/80 hover:bg-white/[0.1]'
  }`
  if (disabled) return <div className={cls}>{icon}<span>{label}</span></div>
  return (
    <a href={href} target="_blank" rel="noreferrer" className={cls}>
      {icon}
      <span>{label}</span>
    </a>
  )
}
