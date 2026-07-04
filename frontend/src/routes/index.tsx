import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { SignedIn, SignedOut, SignInButton, UserButton, useAuth } from '@clerk/clerk-react'
import { useQuery } from '@tanstack/react-query'
import Map, { Marker, type MapRef, type ViewStateChangeEvent } from 'react-map-gl'
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
import { ShareModal } from '../components/ShareModal'
import { Toasts, type Toast } from '../components/Toasts'

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN as string

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
    <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-950 text-white">
      <h1 className="text-5xl font-black tracking-tight">
        Vibe<span className="text-emerald-400">Map</span>
      </h1>
      <p className="mt-3 max-w-md text-center text-zinc-400">
        A live map of your city that gets your mood — and your friends.
      </p>
      <SignInButton mode="modal">
        <button className="mt-8 rounded-2xl bg-emerald-500 px-8 py-3 font-semibold text-zinc-900 transition-all hover:bg-emerald-400">
          Sign in to explore
        </button>
      </SignInButton>
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
  const [selected, setSelected] = useState<(LivePlace & { score?: number; distanceMeters?: number }) | null>(null)
  const [showSocial, setShowSocial] = useState(false)
  const [showOnboarding, setShowOnboarding] = useState(false)
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
  useEffect(() => {
    if (me.data && !me.data.onboardingCompletedAt) setShowOnboarding(true)
  }, [me.data])

  // Geolocate once
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

  // Realtime inbox: chat, friend events, "I'm here" / "intent to go" alerts
  useUserChannel(me.data?.id, (e) => {
    const p = e.payload as Record<string, unknown>
    if (e.event === 'chat_message') pushToast(`💬 ${p.senderName as string}: ${p.content as string}`)
    else if (e.event === 'friend_request') pushToast(`👋 Friend request from ${(p.from as { name: string }).name}`)
    else if (e.event === 'friend_accepted') pushToast('🤝 Friend request accepted')
    else if (e.event === 'im_here') pushToast(`📍 ${(p.from as { name: string }).name} is out — check the map!`)
    else if (e.event === 'intent_to_go') pushToast(`🚶 ${(p.from as { name: string }).name} is heading somewhere`)
  })

  // Viewport places — debounced ~400ms; the backend handles geo-cell throttling
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
    enabled: !!bounds && me.data?.onboardingCompletedAt != null,
    staleTime: 60_000,
  })

  const recommendations = useQuery({
    queryKey: ['recommendations', mood, Math.round(center.lat * 200), Math.round(center.lng * 200)],
    queryFn: () =>
      api<{ recommendations: ScoredPlace[] }>(
        `/api/recommendations?mood=${mood}&lat=${center.lat}&lng=${center.lng}&radius=3000`,
      ),
    enabled: !!mood && me.data?.onboardingCompletedAt != null,
    staleTime: 60_000,
  })

  const selectMood = useCallback((m: MoodType | null) => {
    setMood(m)
    setSelected(null)
    if (m) api('/api/users/mood', { method: 'POST', body: JSON.stringify({ mood: m }) }).catch(() => undefined)
    else api('/api/users/mood', { method: 'DELETE' }).catch(() => undefined)
  }, [])

  const shares = useQuery({
    queryKey: ['shares'],
    queryFn: () => api<SharesResponse>('/api/location/shares'),
    enabled: !!me.data,
    refetchInterval: 30_000,
  })

  const recIds = useMemo(
    () => new Set((recommendations.data?.recommendations ?? []).map((r) => r.googlePlaceId)),
    [recommendations.data],
  )
  const moodMeta = moodById(mood)

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-zinc-950">
      <Map
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
        {(places.data?.places ?? []).map((p) => {
          const isRec = recIds.has(p.googlePlaceId)
          return (
            <Marker
              key={p.googlePlaceId}
              latitude={p.lat}
              longitude={p.lng}
              onClick={(e) => {
                e.originalEvent.stopPropagation()
                const rec = recommendations.data?.recommendations.find(
                  (r) => r.googlePlaceId === p.googlePlaceId,
                )
                setSelected(rec ?? p)
              }}
            >
              <div
                className="cursor-pointer rounded-full border-2 transition-transform hover:scale-125"
                style={{
                  width: isRec ? 18 : 11,
                  height: isRec ? 18 : 11,
                  backgroundColor: isRec && moodMeta ? moodMeta.color : '#71717a',
                  borderColor: isRec ? 'white' : '#3f3f46',
                  boxShadow: isRec && moodMeta ? `0 0 12px ${moodMeta.color}` : undefined,
                }}
              />
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
      </Map>

      {/* Top bar */}
      <div className="pointer-events-none absolute inset-x-0 top-4 flex items-start justify-between px-4">
        <div className="pointer-events-auto flex items-center gap-2 rounded-2xl border border-white/10 bg-zinc-900/80 px-4 py-2 shadow-2xl backdrop-blur-md">
          <span className="font-black text-white">
            Vibe<span className="text-emerald-400">Map</span>
          </span>
        </div>
        <MoodBar active={mood} onSelect={selectMood} />
        <div className="pointer-events-auto flex items-center gap-2">
          <button
            onClick={() => setShowSocial((v) => !v)}
            className="rounded-2xl border border-white/10 bg-zinc-900/80 px-4 py-2 text-sm text-white shadow-2xl backdrop-blur-md hover:bg-zinc-800"
          >
            👥 Friends
          </button>
          <button
            onClick={() => setShowOnboarding(true)}
            className="rounded-2xl border border-white/10 bg-zinc-900/80 px-4 py-2 text-sm text-white shadow-2xl backdrop-blur-md hover:bg-zinc-800"
            title="Edit interests"
          >
            ✨
          </button>
          <div className="rounded-2xl border border-white/10 bg-zinc-900/80 p-1.5 shadow-2xl backdrop-blur-md">
            <UserButton />
          </div>
        </div>
      </div>

      {/* Left: recommendations */}
      {mood && (
        <div className="pointer-events-none absolute left-4 top-20">
          <RecommendationsPanel
            mood={mood}
            recommendations={recommendations.data?.recommendations ?? []}
            isLoading={recommendations.isLoading}
            onPick={(r) => {
              setSelected(r)
              mapRef.current?.flyTo({ center: [r.lng, r.lat], zoom: 16 })
            }}
          />
        </div>
      )}

      {/* Right: place detail / social */}
      <div className="pointer-events-none absolute right-4 top-20 flex flex-col gap-3">
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

      {showOnboarding && (
        <OnboardingModal
          initialTags={me.data?.interests.map((i) => i.tag)}
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
