import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import type { FriendsResponse, LivePlace } from '../lib/types'

interface Props {
  place: LivePlace | null
  shareType: 'im_here' | 'intent_to_go'
  position: { lat: number; lng: number } | null
  onClose: () => void
}

export function ShareModal({ place, shareType, position, onClose }: Props) {
  const queryClient = useQueryClient()
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const friends = useQuery({
    queryKey: ['friends'],
    queryFn: () => api<FriendsResponse>('/api/friends'),
  })

  const share = useMutation({
    mutationFn: () =>
      api('/api/location/shares', {
        method: 'POST',
        body: JSON.stringify({
          shareType,
          recipientIds: [...selected],
          placeId: place?.placeId ?? null,
          lat: place?.lat ?? position?.lat ?? null,
          lng: place?.lng ?? position?.lng ?? null,
          durationMinutes: 60,
        }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shares'] })
      onClose()
    },
  })

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-md">
      <div className="animate-pop-in w-full max-w-md rounded-2.5xl panel-solid p-6 shadow-2xl">
        <h3 className="text-lg font-bold text-white">
          {shareType === 'im_here' ? "📍 Tell friends you're here" : "🚶 Tell friends you're heading there"}
        </h3>
        <p className="mt-1 text-sm text-white/55">
          {place ? place.name : 'Your current location'} · visible for 1 hour · only to the friends
          you pick
        </p>
        <div className="thin-scroll mt-4 max-h-64 space-y-2 overflow-y-auto">
          {friends.data?.friends.length === 0 && (
            <p className="text-sm text-white/45">Add friends first to share your location.</p>
          )}
          {friends.data?.friends.map((f) => (
            <label
              key={f.friendshipId}
              className="flex cursor-pointer items-center gap-3 rounded-xl bg-white/5 px-3 py-2.5 hover:bg-white/10"
            >
              <input
                type="checkbox"
                checked={selected.has(f.user.id)}
                onChange={() => toggle(f.user.id)}
                className="h-4 w-4 accent-[#7c6cff]"
              />
              <span className="text-sm text-white">{f.user.name}</span>
            </label>
          ))}
        </div>
        {share.isError && (
          <p className="mt-3 text-sm text-rose-400">{(share.error as Error).message}</p>
        )}
        <div className="mt-6 flex justify-end gap-3">
          <button onClick={onClose} className="rounded-xl px-4 py-2 text-sm text-white/55 hover:text-white">
            Cancel
          </button>
          <button
            disabled={selected.size === 0 || share.isPending}
            onClick={() => share.mutate()}
            className="btn-accent rounded-xl px-5 py-2 text-sm font-bold disabled:opacity-40"
          >
            {share.isPending ? 'Sharing…' : 'Share'}
          </button>
        </div>
      </div>
    </div>
  )
}
