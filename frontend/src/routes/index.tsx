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
import { OnboardingScreen } from '../components/OnboardingModal'
import { PlaceDetailSheet } from '../components/PlaceDetailPanel'
import { RecommendationsCarousel } from '../components/RecommendationsPanel'
import { SocialSheet } from '../components/SocialPanel'
import { ShareSheet } from '../components/ShareModal'
import { Toasts, type Toast } from '../components/Toasts'

const MAPBOX_TOKEN = (import.meta.env.VITE_MAPBOX_PUBLIC_TOKEN ??
  import.meta.env.VITE_MAPBOX_ACCESS_TOKEN) as string

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
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-orange-100 via-rose-50 to-sky-100 px-6">
      <div className="animate-pop-in flex w-full max-w-md flex-col items-center rounded-[2.5rem] bg-white/80 p-10 text-center shadow-2xl backdrop-blur">
        <span className="text-6xl">🗺️</span>
        <h1 className="mt-4 text-5xl font-black tracking-tight text-slate-900">
          Vibe
          <span className="bg-gradient-to-r from-orange-400 to-pink-500 bg-clip-text text-transparent">
            Map
          </span>
        </h1>
        <p className="mt-3 text-slate-500">
          A live map of your city that gets your mood — and your friends.
        </p>
        <SignInButton mode="modal">
          <button className="mt-8 w-full rounded-full bg-gradient-to-r from-orange-400 to-pink-500 px-8 py-4 text-lg font-bold text-white shadow-lg transition-transform hover:scale-105">
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

type Sheet = 'social' | null

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
  const [sheet, setSheet] = useState<Sheet>(null)
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
    <div className="relative h-screen w-screen overflow-hidden bg-orange-50">
      <Map
        ref={mapRef}
        mapboxAccessToken={MAPBOX_TOKEN}
        initialViewState={{ latitude: center.lat, longitude: center.lng, zoom: 14 }}
        mapStyle="mapbox://styles/mapbox/light-v11"
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
                setSheet(null)
              }}
            >
              <div
                className="cursor-pointer rounded-full border-2 transition-transform hover:scale-125"
                style={{
                  width: isRec ? 20 : 12,
                  height: isRec ? 20 : 12,
                  backgroundColor: isRec && moodMeta ? moodMeta.color : '#94a3b8',
                  borderColor: 'white',
                  boxShadow: isRec && moodMeta ? `0 0 14px ${moodMeta.color}` : '0 1px 4px rgba(0,0,0,0.25)',
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
                <span className="rounded-full bg-sky-500 px-2.5 py-1 text-[10px] font-bold text-white shadow-lg">
                  {s.user?.name ?? 'Friend'} {s.signalLost ? '(signal lost)' : ''}
                </span>
                <span className="mt-0.5 h-3.5 w-3.5 rounded-full border-2 border-white bg-sky-500 shadow" />
              </div>
            </Marker>
          ))}
      </Map>

      {/* Top: header + mood carousel */}
      <div className="pointer-events-none absolute inset-x-0 top-0">
        <div className="flex items-center justify-between px-4 pt-4">
          <span className="pointer-events-auto rounded-full bg-white px-4 py-2 text-lg font-black text-slate-900 shadow-md">
            🗺️ Vibe
            <span className="bg-gradient-to-r from-orange-400 to-pink-500 bg-clip-text text-transparent">
              Map
            </span>
          </span>
          <span className="pointer-events-auto rounded-full bg-white p-1.5 shadow-md">
            <UserButton />
          </span>
        </div>
        <MoodBar active={mood} onSelect={selectMood} />
      </div>

      {/* Bottom stack: recommendations carousel → sheets → nav bar */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col justify-end">
        {mood && !selected && sheet === null && (
          <RecommendationsCarousel
            mood={mood}
            recommendations={recommendations.data?.recommendations ?? []}
            isLoading={recommendations.isLoading}
            onPick={(r) => {
              setSelected(r)
              mapRef.current?.flyTo({ center: [r.lng, r.lat], zoom: 16 })
            }}
          />
        )}

        {sheet === 'social' && me.data && (
          <SocialSheet
            meId={me.data.id}
            onClose={() => setSheet(null)}
            onFocusShare={(lat, lng) => {
              setSheet(null)
              mapRef.current?.flyTo({ center: [lng, lat], zoom: 16 })
            }}
          />
        )}
        {selected && sheet === null && (
          <PlaceDetailSheet
            place={selected}
            activeMood={mood}
            onClose={() => setSelected(null)}
            onShare={(place, type) => setShareIntent({ place, type })}
          />
        )}

        {/* Bottom navigation */}
        <nav className="pointer-events-auto z-10 flex items-center justify-around border-t border-slate-100 bg-white px-4 pb-4 pt-2 shadow-[0_-4px_20px_rgba(0,0,0,0.06)]">
          <NavButton
            icon="🧭"
            label="Explore"
            active={sheet === null && !selected}
            onClick={() => {
              setSheet(null)
              setSelected(null)
            }}
          />
          <NavButton
            icon="👥"
            label="Friends"
            active={sheet === 'social'}
            onClick={() => {
              setSelected(null)
              setSheet((s) => (s === 'social' ? null : 'social'))
            }}
          />
          <NavButton icon="✨" label="Interests" active={false} onClick={() => setShowOnboarding(true)} />
        </nav>
      </div>

      {showOnboarding && (
        <OnboardingScreen
          initialTags={me.data?.interests.map((i) => i.tag)}
          onDone={() => setShowOnboarding(false)}
        />
      )}
      {shareIntent && (
        <ShareSheet
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

function NavButton({
  icon,
  label,
  active,
  onClick,
}: {
  icon: string
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center gap-0.5 rounded-2xl px-6 py-1.5 transition-colors ${
        active ? 'bg-orange-100 text-orange-600' : 'text-slate-400 hover:text-slate-600'
      }`}
    >
      <span className="text-xl">{icon}</span>
      <span className="text-[11px] font-bold">{label}</span>
    </button>
  )
}
