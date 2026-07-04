import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import type { ChatMessage, FriendEntry, FriendsResponse, SharesResponse } from '../lib/types'

interface Props {
  meId: string
  onClose: () => void
  onFocusShare: (lat: number, lng: number) => void
}

export function SocialPanel({ meId, onClose, onFocusShare }: Props) {
  const [chatWith, setChatWith] = useState<FriendEntry | null>(null)

  return (
    <div className="pointer-events-auto flex h-[70vh] w-96 flex-col rounded-2xl border border-white/10 bg-zinc-900/90 shadow-2xl backdrop-blur-md">
      <div className="flex items-center justify-between border-b border-white/10 px-5 py-3">
        <h3 className="font-bold text-white">{chatWith ? chatWith.user.name : 'Friends'}</h3>
        <div className="flex gap-3">
          {chatWith && (
            <button onClick={() => setChatWith(null)} className="text-sm text-zinc-400 hover:text-white">
              ← Back
            </button>
          )}
          <button onClick={onClose} className="text-zinc-500 hover:text-white">
            ✕
          </button>
        </div>
      </div>
      {chatWith ? (
        <ChatView meId={meId} friend={chatWith} />
      ) : (
        <FriendsView onChat={setChatWith} onFocusShare={onFocusShare} />
      )}
    </div>
  )
}

function FriendsView({
  onChat,
  onFocusShare,
}: {
  onChat: (f: FriendEntry) => void
  onFocusShare: (lat: number, lng: number) => void
}) {
  const queryClient = useQueryClient()
  const [email, setEmail] = useState('')

  const friends = useQuery({
    queryKey: ['friends'],
    queryFn: () => api<FriendsResponse>('/api/friends'),
  })
  const shares = useQuery({
    queryKey: ['shares'],
    queryFn: () => api<SharesResponse>('/api/location/shares'),
    refetchInterval: 30_000,
  })

  const sendRequest = useMutation({
    mutationFn: () =>
      api('/api/friends/requests', { method: 'POST', body: JSON.stringify({ email }) }),
    onSuccess: () => {
      setEmail('')
      queryClient.invalidateQueries({ queryKey: ['friends'] })
    },
  })
  const respond = useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'accept' | 'reject' }) =>
      api(`/api/friends/requests/${id}/respond`, {
        method: 'POST',
        body: JSON.stringify({ action }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['friends'] }),
  })

  return (
    <div className="flex-1 space-y-5 overflow-y-auto p-5">
      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (email) sendRequest.mutate()
        }}
        className="flex gap-2"
      >
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Add friend by email"
          type="email"
          className="flex-1 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-zinc-500 outline-none focus:border-emerald-400"
        />
        <button
          type="submit"
          disabled={sendRequest.isPending}
          className="rounded-xl bg-emerald-500 px-4 text-sm font-semibold text-zinc-900 hover:bg-emerald-400 disabled:opacity-40"
        >
          Add
        </button>
      </form>
      {sendRequest.isError && (
        <p className="text-xs text-rose-400">{(sendRequest.error as Error).message}</p>
      )}

      {(friends.data?.incoming.length ?? 0) > 0 && (
        <section>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Requests</h4>
          <ul className="mt-2 space-y-2">
            {friends.data!.incoming.map((r) => (
              <li key={r.friendshipId} className="flex items-center justify-between rounded-xl bg-white/5 px-3 py-2">
                <span className="text-sm text-white">{r.user.name}</span>
                <span className="flex gap-2">
                  <button
                    onClick={() => respond.mutate({ id: r.friendshipId, action: 'accept' })}
                    className="rounded-lg bg-emerald-500/20 px-2.5 py-1 text-xs text-emerald-300 hover:bg-emerald-500/30"
                  >
                    Accept
                  </button>
                  <button
                    onClick={() => respond.mutate({ id: r.friendshipId, action: 'reject' })}
                    className="rounded-lg bg-white/10 px-2.5 py-1 text-xs text-zinc-300 hover:bg-white/20"
                  >
                    Decline
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h4 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Friends</h4>
        {friends.data?.friends.length === 0 && (
          <p className="mt-2 text-sm text-zinc-500">No friends yet — add someone by email.</p>
        )}
        <ul className="mt-2 space-y-2">
          {friends.data?.friends.map((f) => (
            <li key={f.friendshipId} className="flex items-center justify-between rounded-xl bg-white/5 px-3 py-2">
              <div>
                <p className="text-sm text-white">{f.user.name}</p>
                <p className="text-[11px] text-zinc-500">{f.user.email}</p>
              </div>
              <button
                onClick={() => onChat(f)}
                className="rounded-lg bg-white/10 px-3 py-1.5 text-xs text-zinc-200 hover:bg-white/20"
              >
                💬 Chat
              </button>
            </li>
          ))}
        </ul>
        {(friends.data?.outgoing.length ?? 0) > 0 && (
          <p className="mt-2 text-[11px] text-zinc-500">
            Pending sent: {friends.data!.outgoing.map((o) => o.user.name).join(', ')}
          </p>
        )}
      </section>

      {(shares.data?.incoming.length ?? 0) > 0 && (
        <section>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
            Friends sharing location
          </h4>
          <ul className="mt-2 space-y-2">
            {shares.data!.incoming.map((s) => (
              <li key={s.id} className="flex items-center justify-between rounded-xl bg-white/5 px-3 py-2">
                <div>
                  <p className="text-sm text-white">
                    {s.user?.name ?? 'Friend'}{' '}
                    <span className="text-[11px] text-zinc-500">
                      {s.share_type === 'im_here' ? 'is here' : 'is heading out'}
                    </span>
                  </p>
                  {s.signalLost && <p className="text-[11px] text-amber-400">signal lost</p>}
                </div>
                {s.last_known_lat != null && s.last_known_lng != null && (
                  <button
                    onClick={() => onFocusShare(s.last_known_lat!, s.last_known_lng!)}
                    className="rounded-lg bg-white/10 px-3 py-1.5 text-xs text-zinc-200 hover:bg-white/20"
                  >
                    View
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

function ChatView({ meId, friend }: { meId: string; friend: FriendEntry }) {
  const queryClient = useQueryClient()
  const [draft, setDraft] = useState('')

  const messages = useQuery({
    queryKey: ['chat', friend.user.id],
    queryFn: () => api<{ messages: ChatMessage[] }>(`/api/chat/${friend.user.id}`),
    refetchInterval: 15_000,
  })

  const send = useMutation({
    mutationFn: (content: string) =>
      api(`/api/chat/${friend.user.id}`, { method: 'POST', body: JSON.stringify({ content }) }),
    onSuccess: () => {
      setDraft('')
      queryClient.invalidateQueries({ queryKey: ['chat', friend.user.id] })
    },
  })

  return (
    <>
      <div className="flex flex-1 flex-col-reverse overflow-y-auto p-4">
        <div className="space-y-2">
          {(messages.data?.messages ?? []).map((m) => (
            <div key={m.id} className={`flex ${m.sender_id === meId ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[75%] rounded-2xl px-3.5 py-2 text-sm ${
                  m.sender_id === meId ? 'bg-emerald-500 text-zinc-900' : 'bg-white/10 text-white'
                }`}
              >
                {m.content}
              </div>
            </div>
          ))}
        </div>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (draft.trim()) send.mutate(draft.trim())
        }}
        className="flex gap-2 border-t border-white/10 p-3"
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Message…"
          className="flex-1 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-zinc-500 outline-none focus:border-emerald-400"
        />
        <button
          type="submit"
          disabled={send.isPending || !draft.trim()}
          className="rounded-xl bg-emerald-500 px-4 text-sm font-semibold text-zinc-900 hover:bg-emerald-400 disabled:opacity-40"
        >
          Send
        </button>
      </form>
    </>
  )
}
