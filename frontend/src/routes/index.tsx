import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { SignedIn, SignedOut, SignInButton, UserButton, useAuth } from '@clerk/clerk-react'
import { useQuery } from '@tanstack/react-query'
import MapGL, { Marker, type MapRef, type ViewStateChangeEvent } from 'react-map-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import { api, setTokenGetter } from '../lib/api'
import { useUserChannel } from '../lib/realtime'
import { moodById } from '../lib/moods'
import type { LivePlace, Me, MoodType, ScoredPlace, SharesResponse } from '../lib/types'
import { MoodBar } from '../components/MoodBar'
import { OnboardingModal } from '../components/OnboardingModal'
import { PlaceDetailPanel } from '../components/PlaceDetailPanel'
import { RecommendationsPanel } from '../components/RecommendationsPanel'
import { SocialPanel } from '../components/SocialPanel'
import { SearchBar } from '../components/SearchBar'
import { ShareModal } from '../components/ShareModal'
import { Toasts, type Toast } from '../components/Toasts'
import { IconPeople, IconSparkle } from '../components/icons'

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_PUBLIC_TOKEN as string

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore – path literal is required by TanStack Router Vite plugin; routeTree.gen.ts overrides this type
export const Route = createFileRoute('/')({
  component: IndexPage,
})

function IndexPage() {
  return (
    <>
      <SignedOut>
        <Landing />
      </SignedOut>
      <SignedIn>
        <VibeMapApp />
      </SignedIn>
    </>
  )
}

function Landing() {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-[#0a0a0f] px-6 text-center text-white">
      <div className="brand-gradient pointer-events-none absolute -top-48 left-1/2 h-[560px] w-[560px] -translate-x-1/2 rounded-full opacity-[0.16] blur-[130px]" />
      <div className="relative z-10">
        <span className="rounded-full panel px-4 py-1.5 text-xs font-medium tracking-wide text-white/70">
          your city, tuned to your mood
        </span>
        <h1 className="mt-6 text-6xl font-bold tracking-tight sm:text-7xl">
          Vibe<span className="brand-text">Map</span>
        </h1>
        <p className="mx-auto mt-4 max-w-md text-lg leading-relaxed text-white/55">
          A living map that surfaces the spots you'll love — matched to how you feel, right now.
          Then find your people.
        </p>
        <SignInButton mode="modal">
          <button className="btn-accent mt-9 rounded-xl px-9 py-3.5 text-base font-semibold shadow-soft">
            Sign in to explore
          </button>
        </SignInButton>
      </div>
    </div>
  )
}

interface Bounds {
  north: number
  south: number
  east: number
  west: number
}

function VibeMapApp() {
  const { getToken } = useAuth()
  useEffect(() => {
    setTokenGetter(() => getToken())
  }, [getToken])

  const mapRef = useRef<MapRef>(null)
  const [mood, setMood] = useState<MoodType | null>(null)
  const [bounds, setBounds] = useState<Bounds | null>(null)
  const [center, setCenter] = useState({ lat: 40.4168, lng: -3.7038 }) // Madrid default
  const [selected, setSelected] = useState<
    (LivePlace & { score?: number; distanceMeters?: number }) | null
  >(null)
  const [showSocial, setShowSocial] = useState(false)
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [showRecs, setShowRecs] = useState(true)
  const [shareIntent, setShareIntent] = useState<{
    place: LivePlace | null
    type: 'im_here' | 'intent_to_go'
  } | null>(null)
  const [toasts, setToasts] = useState<Toast[]>([])
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const pushToast = useCallback((text: string) => {
    const id = Date.now() + Math.random()
    setToasts((prev) => [...prev, { id, text }])
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 8000)
  }, [])

  const me = useQuery({ queryKey: ['me'], queryFn: () => api<Me>('/api/users/me') })
  const onboarded = me.data?.onboardingCompletedAt != null
  useEffect(() => {
    if (me.data && !me.data.onboardingCompletedAt) setShowOnboarding(true)
  }, [me.data])

  useEffect(() => {
    navigator.geolocation?.getCurrentPosition(
      (pos) => {
        const c = { lat: pos.coords.latitude, lng: pos.coords.longitude }
        setCenter(c)
        mapRef.current?.flyTo({ center: [c.lng, c.lat], zoom: 15 })
      },
      () => undefined,
      { timeout: 5000 },
    )
  }, [])

  useUserChannel(me.data?.id, (e) => {
    const p = e.payload as Record<string, unknown>
    if (e.event === 'chat_message') pushToast(`💬 ${p.senderName as string}: ${p.content as string}`)
    else if (e.event === 'friend_request')
      pushToast(`New friend request from ${(p.from as { name: string }).name}`)
    else if (e.event === 'friend_accepted') pushToast('Friend request accepted')
    else if (e.event === 'im_here')
      pushToast(`${(p.from as { name: string }).name} is out — check the map`)
    else if (e.event === 'intent_to_go')
      pushToast(`${(p.from as { name: string }).name} is heading somewhere`)
  })

  const onMoveEnd = useCallback((e: ViewStateChangeEvent) => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      const b = e.target.getBounds()
      if (!b) return
      setBounds({ north: b.getNorth(), south: b.getSouth(), east: b.getEast(), west: b.getWest() })
      const c = e.target.getCenter()
      setCenter({ lat: c.lat, lng: c.lng })
    }, 400)
  }, [])

  const places = useQuery({
    queryKey: ['places', bounds, mood],
    queryFn: () =>
      api<{ places: LivePlace[] }>(
        `/api/places?north=${bounds!.north}&south=${bounds!.south}&east=${bounds!.east}&west=${bounds!.west}${mood ? `&mood=${mood}` : ''}`,
      ),
    enabled: !!bounds && onboarded,
    staleTime: 60_000,
  })

  const recommendations = useQuery({
    queryKey: ['recommendations', mood, Math.round(center.lat * 200), Math.round(center.lng * 200)],
    queryFn: () =>
      api<{ recommendations: ScoredPlace[] }>(
        `/api/recommendations?mood=${mood}&lat=${center.lat}&lng=${center.lng}&radius=3000`,
      ),
    enabled: !!mood && onboarded,
    staleTime: 60_000,
  })

  const selectMood = useCallback((m: MoodType | null) => {
    setMood(m)
    setSelected(null)
    setShowRecs(true)
    if (m) api('/api/users/mood', { method: 'POST', body: JSON.stringify({ mood: m }) }).catch(() => undefined)
    else api('/api/users/mood', { method: 'DELETE' }).catch(() => undefined)
  }, [])

  const shares = useQuery({
    queryKey: ['shares'],
    queryFn: () => api<SharesResponse>('/api/location/shares'),
    enabled: !!me.data,
    refetchInterval: 30_000,
  })

  const moodMeta = moodById(mood)
  const recList = recommendations.data?.recommendations ?? []

  const { recRank, recById, dotPlaces } = useMemo(() => {
    const rank = new Map<string, number>()
    const byId = new Map<string, ScoredPlace>()
    recList.forEach((r, i) => {
      rank.set(r.googlePlaceId, i + 1)
      byId.set(r.googlePlaceId, r)
    })
    const dots = (places.data?.places ?? []).filter((p) => !byId.has(p.googlePlaceId))
    return { recRank: rank, recById: byId, dotPlaces: dots }
  }, [recList, places.data])

  const openPlace = useCallback(
    (p: LivePlace) => setSelected(recById.get(p.googlePlaceId) ?? p),
    [recById],
  )

  const flyToPlace = useCallback((p: LivePlace, zoom = 16) => {
    setSelected(p)
    setShowSocial(false)
    mapRef.current?.flyTo({ center: [p.lng, p.lat], zoom })
  }, [])

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-[#0a0a0f]">
      <MapGL
        ref={mapRef}
        mapboxAccessToken={MAPBOX_TOKEN}
        initialViewState={{ latitude: center.lat, longitude: center.lng, zoom: 14 }}
        mapStyle="mapbox://styles/mapbox/dark-v11"
        onMoveEnd={onMoveEnd}
        onLoad={(e) => {
          const b = e.target.getBounds()
          if (b) setBounds({ north: b.getNorth(), south: b.getSouth(), east: b.getEast(), west: b.getWest() })
        }}
      >
        {dotPlaces.map((p) => {
          const isSel = selected?.googlePlaceId === p.googlePlaceId
          return (
            <Marker
              key={p.googlePlaceId}
              latitude={p.lat}
              longitude={p.lng}
              onClick={(e) => {
                e.originalEvent.stopPropagation()
                openPlace(p)
              }}
            >
              <div
                className={`cursor-pointer rounded-full transition-transform hover:scale-150 ${
                  isSel ? 'ring-2 ring-white' : ''
                }`}
                style={{
                  width: isSel ? 12 : 8,
                  height: isSel ? 12 : 8,
                  background: 'rgba(255,255,255,0.6)',
                  border: '1px solid rgba(0,0,0,0.35)',
                }}
              />
            </Marker>
          )
        })}

        {recList.map((r) => {
          const rank = recRank.get(r.googlePlaceId)
          const isSel = selected?.googlePlaceId === r.googlePlaceId
          const color = moodMeta?.color ?? '#7c6cff'
          return (
            <Marker
              key={`rec-${r.googlePlaceId}`}
              latitude={r.lat}
              longitude={r.lng}
              onClick={(e) => {
                e.originalEvent.stopPropagation()
                setSelected(r)
              }}
            >
              <div className="relative flex cursor-pointer items-center justify-center">
                <span
                  className="animate-rec-ping absolute h-7 w-7 rounded-full"
                  style={{ background: color }}
                />
                <span
                  className={`relative flex items-center justify-center rounded-full text-[11px] font-bold text-white shadow-lg transition-transform hover:scale-110 ${
                    isSel ? 'scale-110 ring-2 ring-white' : 'ring-2 ring-white/70'
                  }`}
                  style={{ width: 28, height: 28, background: color }}
                >
                  {rank}
                </span>
              </div>
            </Marker>
          )
        })}

        {(shares.data?.incoming ?? [])
          .filter((s) => s.last_known_lat != null && s.last_known_lng != null)
          .map((s) => (
            <Marker key={s.id} latitude={s.last_known_lat!} longitude={s.last_known_lng!}>
              <div className="flex flex-col items-center">
                <span className="rounded-full bg-sky-400 px-2 py-0.5 text-[10px] font-bold text-zinc-900 shadow-lg">
                  {s.user?.name ?? 'Friend'} {s.signalLost ? '(signal lost)' : ''}
                </span>
                <span className="mt-0.5 h-3 w-3 rounded-full border-2 border-white bg-sky-400" />
              </div>
            </Marker>
          ))}
      </MapGL>

      {/* top gradient for legibility */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-black/40 to-transparent" />

      {/* top-left: brand + search */}
      <div className="pointer-events-none absolute left-4 top-4 flex flex-col gap-2">
        <div className="pointer-events-auto inline-flex w-fit items-center rounded-xl panel px-3 py-1.5 shadow-soft">
          <span className="text-[15px] font-bold tracking-tight text-white">
            Vibe<span className="brand-text">Map</span>
          </span>
        </div>
        <SearchBar center={center} onPick={(p) => flyToPlace(p)} />
      </div>

      {/* top-right: actions */}
      <div className="pointer-events-auto absolute right-4 top-4 flex items-center gap-2">
        <button
          onClick={() => {
            setShowSocial((v) => !v)
            setSelected(null)
          }}
          className={`inline-flex items-center gap-2 rounded-xl px-3.5 py-2.5 text-sm font-semibold shadow-soft transition ${
            showSocial ? 'btn-accent' : 'panel text-white/85 hover:text-white'
          }`}
        >
          <IconPeople width={17} height={17} />
          <span className="hidden sm:inline">People</span>
        </button>
        <button
          onClick={() => setShowOnboarding(true)}
          className="inline-flex items-center justify-center rounded-xl panel p-2.5 text-white/85 shadow-soft transition hover:text-white"
          title="Edit interests"
        >
          <IconSparkle width={17} height={17} />
        </button>
        <div className="rounded-xl panel p-1.5 shadow-soft">
          <UserButton />
        </div>
      </div>

      {/* left rail: recommendations (below search) */}
      {mood && showRecs && (
        <div className="absolute left-4 top-32">
          <RecommendationsPanel
            mood={mood}
            recommendations={recList}
            isLoading={recommendations.isLoading}
            selectedId={selected?.googlePlaceId}
            onClose={() => setShowRecs(false)}
            onPick={(r) => flyToPlace(r)}
          />
        </div>
      )}
      {mood && !showRecs && (
        <button
          onClick={() => setShowRecs(true)}
          className="absolute left-4 top-32 inline-flex items-center gap-2 rounded-xl panel px-4 py-2.5 text-sm font-semibold text-white shadow-soft hover:bg-white/[0.06]"
        >
          <span>{moodMeta?.emoji}</span> Show picks
        </button>
      )}

      {/* right: place detail / social */}
      <div className="absolute right-4 top-[4.75rem] flex flex-col gap-3">
        {showSocial && me.data && (
          <SocialPanel
            meId={me.data.id}
            onClose={() => setShowSocial(false)}
            onFocusShare={(lat, lng) => mapRef.current?.flyTo({ center: [lng, lat], zoom: 16 })}
          />
        )}
        {selected && !showSocial && (
          <PlaceDetailPanel
            place={selected}
            activeMood={mood}
            onClose={() => setSelected(null)}
            onShare={(place, type) => setShareIntent({ place, type })}
          />
        )}
      </div>

      {/* bottom: mood selector */}
      <div className="pointer-events-none absolute inset-x-0 bottom-6 flex justify-center px-4">
        <MoodBar active={mood} onSelect={selectMood} />
      </div>

      {showOnboarding && (
        <OnboardingModal
          initialTags={me.data?.interests.map((i) => i.tag)}
          editing={onboarded}
          onDone={() => setShowOnboarding(false)}
        />
      )}
      {shareIntent && (
        <ShareModal
          place={shareIntent.place}
          shareType={shareIntent.type}
          position={center}
          onClose={() => setShareIntent(null)}
        />
      )}
      <Toasts toasts={toasts} onDismiss={(id) => setToasts((prev) => prev.filter((t) => t.id !== id))} />
    </div>
  )
}
