import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import type { ChatMessage, FriendEntry, FriendsResponse, SharesResponse } from '../lib/types'

interface Props {
  meId: string
  onClose: () => void
  onFocusShare: (lat: number, lng: number) => void
}

/** Bottom-sheet friends hub: requests, friend list, 1:1 chat, live shares. */
export function SocialSheet({ meId, onClose, onFocusShare }: Props) {
  const [chatWith, setChatWith] = useState<FriendEntry | null>(null)

  return (
    <div className="animate-sheet-up pointer-events-auto mx-auto flex h-[70vh] w-full max-w-lg flex-col rounded-t-[2rem] bg-white shadow-[0_-8px_40px_rgba(0,0,0,0.15)]">
      <div className="flex justify-center pt-3">
        <span className="h-1.5 w-12 rounded-full bg-slate-200" />
      </div>
      <div className="flex items-center justify-between px-6 py-3">
        <div className="flex items-center gap-3">
          {chatWith && (
            <button
              onClick={() => setChatWith(null)}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200"
            >
              ←
            </button>
          )}
          <h3 className="text-lg font-extrabold text-slate-900">
            {chatWith ? chatWith.user.name : '👥 Friends'}
          </h3>
        </div>
        <button
          onClick={onClose}
          className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200"
        >
          ✕
        </button>
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
    <div className="flex-1 space-y-5 overflow-y-auto px-6 pb-6">
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
          className="flex-1 rounded-full border-2 border-slate-100 bg-slate-50 px-4 py-2.5 text-sm text-slate-800 placeholder-slate-400 outline-none focus:border-orange-300"
        />
        <button
          type="submit"
          disabled={sendRequest.isPending}
          className="rounded-full bg-gradient-to-r from-orange-400 to-pink-500 px-5 text-sm font-bold text-white shadow-md disabled:opacity-40"
        >
          Add
        </button>
      </form>
      {sendRequest.isError && (
        <p className="text-xs font-medium text-rose-500">{(sendRequest.error as Error).message}</p>
      )}

      {(friends.data?.incoming.length ?? 0) > 0 && (
        <section>
          <h4 className="text-xs font-extrabold uppercase tracking-wide text-slate-400">
            Requests
          </h4>
          <ul className="mt-2 space-y-2">
            {friends.data!.incoming.map((r) => (
              <li
                key={r.friendshipId}
                className="flex items-center justify-between rounded-2xl bg-amber-50 px-4 py-2.5"
              >
                <span className="text-sm font-bold text-slate-800">{r.user.name}</span>
                <span className="flex gap-2">
                  <button
                    onClick={() => respond.mutate({ id: r.friendshipId, action: 'accept' })}
                    className="rounded-full bg-emerald-500 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-600"
                  >
                    Accept
                  </button>
                  <button
                    onClick={() => respond.mutate({ id: r.friendshipId, action: 'reject' })}
                    className="rounded-full bg-slate-200 px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-300"
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
        <h4 className="text-xs font-extrabold uppercase tracking-wide text-slate-400">Friends</h4>
        {friends.data?.friends.length === 0 && (
          <p className="mt-2 text-sm text-slate-400">No friends yet — add someone by email.</p>
        )}
        <ul className="mt-2 space-y-2">
          {friends.data?.friends.map((f) => (
            <li
              key={f.friendshipId}
              className="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-2.5"
            >
              <div>
                <p className="text-sm font-bold text-slate-800">{f.user.name}</p>
                <p className="text-[11px] text-slate-400">{f.user.email}</p>
              </div>
              <button
                onClick={() => onChat(f)}
                className="rounded-full bg-sky-100 px-4 py-1.5 text-xs font-bold text-sky-600 hover:bg-sky-200"
              >
                💬 Chat
              </button>
            </li>
          ))}
        </ul>
        {(friends.data?.outgoing.length ?? 0) > 0 && (
          <p className="mt-2 text-[11px] text-slate-400">
            Pending sent: {friends.data!.outgoing.map((o) => o.user.name).join(', ')}
          </p>
        )}
      </section>

      {(shares.data?.incoming.length ?? 0) > 0 && (
        <section>
          <h4 className="text-xs font-extrabold uppercase tracking-wide text-slate-400">
            Friends sharing location
          </h4>
          <ul className="mt-2 space-y-2">
            {shares.data!.incoming.map((s) => (
              <li
                key={s.id}
                className="flex items-center justify-between rounded-2xl bg-sky-50 px-4 py-2.5"
              >
                <div>
                  <p className="text-sm font-bold text-slate-800">
                    {s.user?.name ?? 'Friend'}{' '}
                    <span className="text-[11px] font-medium text-slate-400">
                      {s.share_type === 'im_here' ? 'is here' : 'is heading out'}
                    </span>
                  </p>
                  {s.signalLost && (
                    <p className="text-[11px] font-bold text-amber-500">signal lost</p>
                  )}
                </div>
                {s.last_known_lat != null && s.last_known_lng != null && (
                  <button
                    onClick={() => onFocusShare(s.last_known_lat!, s.last_known_lng!)}
                    className="rounded-full bg-white px-4 py-1.5 text-xs font-bold text-sky-600 shadow-sm hover:bg-sky-100"
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
      <div className="flex flex-1 flex-col-reverse overflow-y-auto px-5 py-3">
        <div className="space-y-2">
          {(messages.data?.messages ?? []).map((m) => (
            <div
              key={m.id}
              className={`flex ${m.sender_id === meId ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[75%] rounded-3xl px-4 py-2 text-sm font-medium ${
                  m.sender_id === meId
                    ? 'bg-gradient-to-r from-orange-400 to-pink-500 text-white'
                    : 'bg-slate-100 text-slate-800'
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
        className="flex gap-2 border-t border-slate-100 p-4"
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Message…"
          className="flex-1 rounded-full border-2 border-slate-100 bg-slate-50 px-4 py-2.5 text-sm text-slate-800 placeholder-slate-400 outline-none focus:border-orange-300"
        />
        <button
          type="submit"
          disabled={send.isPending || !draft.trim()}
          className="rounded-full bg-gradient-to-r from-orange-400 to-pink-500 px-5 text-sm font-bold text-white shadow-md disabled:opacity-40"
        >
          Send
        </button>
      </form>
    </>
  )
}
