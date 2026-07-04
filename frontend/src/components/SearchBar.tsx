import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import type { LivePlace } from '../lib/types'
import { IconSearch, IconClose, IconPin } from './icons'

interface Props {
  center: { lat: number; lng: number }
  onPick: (place: LivePlace) => void
}

export function SearchBar({ center, onPick }: Props) {
  const [raw, setRaw] = useState('')
  const [debounced, setDebounced] = useState('')
  const [open, setOpen] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const t = setTimeout(() => setDebounced(raw.trim()), 320)
    return () => clearTimeout(t)
  }, [raw])

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  const results = useQuery({
    queryKey: ['search', debounced, Math.round(center.lat * 50), Math.round(center.lng * 50)],
    queryFn: () =>
      api<{ results: LivePlace[] }>(
        `/api/places/search?q=${encodeURIComponent(debounced)}&lat=${center.lat}&lng=${center.lng}`,
      ),
    enabled: debounced.length >= 2,
    staleTime: 60_000,
  })

  const list = results.data?.results ?? []

  return (
    <div ref={boxRef} className="pointer-events-auto w-[340px] max-w-[calc(100vw-2rem)]">
      <div className="flex items-center gap-2.5 rounded-2xl panel px-3.5 py-2.5 shadow-soft">
        <IconSearch width={18} height={18} className="shrink-0 text-white/45" />
        <input
          value={raw}
          onChange={(e) => {
            setRaw(e.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          placeholder="Search places, neighborhoods…"
          className="w-full bg-transparent text-sm text-white outline-none"
        />
        {raw && (
          <button
            onClick={() => {
              setRaw('')
              setDebounced('')
            }}
            className="shrink-0 text-white/40 transition hover:text-white"
          >
            <IconClose width={15} height={15} />
          </button>
        )}
      </div>

      {open && debounced.length >= 2 && (
        <div className="animate-float-in mt-2 max-h-80 overflow-y-auto thin-scroll rounded-2xl panel py-1.5 shadow-panel">
          {results.isLoading && <p className="px-4 py-3 text-sm text-white/45">Searching…</p>}
          {!results.isLoading && list.length === 0 && (
            <p className="px-4 py-3 text-sm text-white/45">No results.</p>
          )}
          {list.map((p) => (
            <button
              key={p.googlePlaceId}
              onClick={() => {
                onPick(p)
                setOpen(false)
              }}
              className="flex w-full items-start gap-3 px-4 py-2.5 text-left transition hover:bg-white/[0.06]"
            >
              <IconPin width={16} height={16} className="mt-0.5 shrink-0 text-white/40" />
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-white">{p.name}</span>
                <span className="block truncate text-[12px] text-white/45">
                  {p.address ?? p.category?.split('_').join(' ')}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
