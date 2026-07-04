import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { moodById, moodGradient } from '../lib/moods'
import type {
  ChatMessage,
  DiscoverResponse,
  DiscoverUser,
  FriendEntry,
  FriendsResponse,
  SharesResponse,
} from '../lib/types'

interface Props {
  meId: string
  onClose: () => void
  onFocusShare: (lat: number, lng: number) => void
}

type Tab = 'discover' | 'friends'

const initials = (name: string) =>
  name
    .split(' ')
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase()

function Avatar({ name }: { name: string }) {
  return (
    <span className="brand-gradient flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-black text-white shadow-md">
      {initials(name) || '🙂'}
    </span>
  )
}

export function SocialPanel({ meId, onClose, onFocusShare }: Props) {
  const [tab, setTab] = useState<Tab>('discover')
  const [chatWith, setChatWith] = useState<FriendEntry | null>(null)

  const friends = useQuery({
    queryKey: ['friends'],
    queryFn: () => api<FriendsResponse>('/api/friends'),
  })
  const incomingCount = friends.data?.incoming.length ?? 0

  return (
    <div className="animate-float-in pointer-events-auto flex h-[calc(100vh-8rem)] max-h-[720px] w-[380px] flex-col overflow-hidden rounded-2.5xl panel shadow-panel">
      {/* header */}
      <div className="flex items-center justify-between px-5 pt-4 pb-3">
        <h3 className="text-lg font-bold text-white">
          {chatWith ? chatWith.user.name : 'People'}
        </h3>
        <div className="flex items-center gap-3">
          {chatWith && (
            <button
              onClick={() => setChatWith(null)}
              className="text-sm font-medium text-white/60 transition hover:text-white"
            >
              ← Back
            </button>
          )}
          <button onClick={onClose} className="text-white/40 transition hover:text-white">
            ✕
          </button>
        </div>
      </div>

      {!chatWith && (
        <div className="mx-5 mb-3 flex rounded-2xl bg-white/[0.05] p-1">
          <TabButton active={tab === 'discover'} onClick={() => setTab('discover')}>
            🔍 Discover
          </TabButton>
          <TabButton active={tab === 'friends'} onClick={() => setTab('friends')}>
            👥 Friends
            {incomingCount > 0 && (
              <span className="ml-1.5 rounded-full bg-rose-500 px-1.5 text-[10px] font-bold text-white">
                {incomingCount}
              </span>
            )}
          </TabButton>
        </div>
      )}

      {chatWith ? (
        <ChatView meId={meId} friend={chatWith} />
      ) : tab === 'discover' ? (
        <DiscoverView onGoToFriends={() => setTab('friends')} />
      ) : (
        <FriendsView onChat={setChatWith} onFocusShare={onFocusShare} />
      )}
    </div>
  )
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-1 items-center justify-center gap-1 rounded-xl py-2 text-sm font-semibold transition-all ${
        active ? 'bg-white/[0.1] text-white shadow-soft' : 'text-white/55 hover:text-white'
      }`}
    >
      {children}
    </button>
  )
}

/* ------------------------------- Discover ------------------------------- */

function DiscoverView({ onGoToFriends }: { onGoToFriends: () => void }) {
  const queryClient = useQueryClient()
  const [query, setQuery] = useState('')

  const discover = useQuery({
    queryKey: ['discover'],
    queryFn: () => api<DiscoverResponse>('/api/users/discover'),
  })

  const addFriend = useMutation({
    mutationFn: (userId: string) =>
      api('/api/friends/requests', { method: 'POST', body: JSON.stringify({ userId }) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['discover'] })
      queryClient.invalidateQueries({ queryKey: ['friends'] })
    },
  })

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const users = discover.data?.users ?? []
    if (!q) return users
    return users.filter(
      (u) =>
        u.name.toLowerCase().includes(q) ||
        u.interests.some((t) => t.toLowerCase().includes(q)),
    )
  }, [discover.data, query])

  return (
    <div className="thin-scroll flex-1 space-y-3 overflow-y-auto px-4 pb-5">
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search people or interests…"
        className="w-full rounded-xl border border-white/10 bg-white/5 px-3.5 py-2.5 text-sm text-white placeholder-white/35 outline-none transition focus:border-accent"
      />

      {discover.isLoading &&
        Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="skeleton h-20 rounded-2xl" />
        ))}

      {!discover.isLoading && filtered.length === 0 && (
        <div className="px-2 py-10 text-center">
          <p className="text-3xl">🫥</p>
          <p className="mt-2 text-sm text-white/55">
            {query ? 'No one matches that search.' : 'No other people to discover yet.'}
          </p>
        </div>
      )}

      {filtered.map((u) => (
        <DiscoverCard
          key={u.id}
          user={u}
          pending={addFriend.isPending && addFriend.variables === u.id}
          onAdd={() => addFriend.mutate(u.id)}
          onGoToFriends={onGoToFriends}
        />
      ))}
      {addFriend.isError && (
        <p className="text-xs text-rose-400">{(addFriend.error as Error).message}</p>
      )}
    </div>
  )
}

function DiscoverCard({
  user,
  pending,
  onAdd,
  onGoToFriends,
}: {
  user: DiscoverUser
  pending: boolean
  onAdd: () => void
  onGoToFriends: () => void
}) {
  const mood = moodById(user.mood)
  return (
    <div className="rounded-2xl bg-white/5 p-3.5 transition-colors hover:bg-white/8">
      <div className="flex items-start gap-3">
        <Avatar name={user.name} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-bold text-white">{user.name}</p>
            {mood && (
              <span
                className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold text-white"
                style={{ background: moodGradient(mood) }}
              >
                {mood.emoji} {mood.label}
              </span>
            )}
          </div>
          {user.interests.length > 0 ? (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {user.interests.slice(0, 5).map((t) => (
                <span
                  key={t}
                  className="rounded-full bg-white/8 px-2 py-0.5 text-[10px] capitalize text-white/60"
                >
                  {t}
                </span>
              ))}
              {user.interests.length > 5 && (
                <span className="px-1 text-[10px] text-white/35">
                  +{user.interests.length - 5}
                </span>
              )}
            </div>
          ) : (
            <p className="mt-1 text-[11px] text-white/35">No interests shared yet</p>
          )}
        </div>
        <div className="shrink-0 self-center">
          <RelationAction
            relationship={user.relationship}
            pending={pending}
            onAdd={onAdd}
            onGoToFriends={onGoToFriends}
          />
        </div>
      </div>
    </div>
  )
}

function RelationAction({
  relationship,
  pending,
  onAdd,
  onGoToFriends,
}: {
  relationship: DiscoverUser['relationship']
  pending: boolean
  onAdd: () => void
  onGoToFriends: () => void
}) {
  if (relationship === 'friends')
    return <span className="rounded-lg bg-emerald-500/15 px-2.5 py-1.5 text-[11px] font-semibold text-emerald-300">✓ Friends</span>
  if (relationship === 'outgoing')
    return <span className="rounded-lg bg-white/8 px-2.5 py-1.5 text-[11px] font-medium text-white/50">Requested</span>
  if (relationship === 'incoming')
    return (
      <button
        onClick={onGoToFriends}
        className="rounded-lg bg-pink-500/20 px-2.5 py-1.5 text-[11px] font-semibold text-pink-200 transition hover:bg-pink-500/30"
      >
        Respond
      </button>
    )
  if (relationship === 'blocked')
    return <span className="rounded-lg bg-white/8 px-2.5 py-1.5 text-[11px] text-white/40">—</span>
  return (
    <button
      onClick={onAdd}
      disabled={pending}
      className="btn-accent rounded-lg px-3 py-1.5 text-[11px] font-bold disabled:opacity-50"
    >
      {pending ? '…' : '+ Add'}
    </button>
  )
}

/* -------------------------------- Friends ------------------------------- */

function FriendsView({
  onChat,
  onFocusShare,
}: {
  onChat: (f: FriendEntry) => void
  onFocusShare: (lat: number, lng: number) => void
}) {
  const queryClient = useQueryClient()

  const friends = useQuery({
    queryKey: ['friends'],
    queryFn: () => api<FriendsResponse>('/api/friends'),
  })
  const shares = useQuery({
    queryKey: ['shares'],
    queryFn: () => api<SharesResponse>('/api/location/shares'),
    refetchInterval: 30_000,
  })

  const respond = useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'accept' | 'reject' }) =>
      api(`/api/friends/requests/${id}/respond`, {
        method: 'POST',
        body: JSON.stringify({ action }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['friends'] })
      queryClient.invalidateQueries({ queryKey: ['discover'] })
    },
  })

  return (
    <div className="thin-scroll flex-1 space-y-5 overflow-y-auto px-5 pb-5">
      {(friends.data?.incoming.length ?? 0) > 0 && (
        <section>
          <h4 className="text-[11px] font-bold uppercase tracking-wide text-white/45">
            Friend requests
          </h4>
          <ul className="mt-2 space-y-2">
            {friends.data!.incoming.map((r) => (
              <li
                key={r.friendshipId}
                className="flex items-center justify-between rounded-2xl bg-white/5 px-3 py-2.5"
              >
                <div className="flex items-center gap-2.5">
                  <Avatar name={r.user.name} />
                  <span className="text-sm font-medium text-white">{r.user.name}</span>
                </div>
                <span className="flex gap-2">
                  <button
                    onClick={() => respond.mutate({ id: r.friendshipId, action: 'accept' })}
                    className="btn-accent rounded-lg px-3 py-1.5 text-xs font-bold"
                  >
                    Accept
                  </button>
                  <button
                    onClick={() => respond.mutate({ id: r.friendshipId, action: 'reject' })}
                    className="rounded-lg bg-white/10 px-2.5 py-1.5 text-xs text-white/70 hover:bg-white/20"
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
        <h4 className="text-[11px] font-bold uppercase tracking-wide text-white/45">Your friends</h4>
        {friends.data?.friends.length === 0 && (
          <p className="mt-2 text-sm text-white/45">
            No friends yet — head to <span className="text-white/70">Discover</span> to find people.
          </p>
        )}
        <ul className="mt-2 space-y-2">
          {friends.data?.friends.map((f) => (
            <li
              key={f.friendshipId}
              className="flex items-center justify-between rounded-2xl bg-white/5 px-3 py-2.5"
            >
              <div className="flex items-center gap-2.5">
                <Avatar name={f.user.name} />
                <div>
                  <p className="text-sm font-medium text-white">{f.user.name}</p>
                  <p className="text-[11px] text-white/40">{f.user.email}</p>
                </div>
              </div>
              <button
                onClick={() => onChat(f)}
                className="rounded-lg bg-white/10 px-3 py-1.5 text-xs font-medium text-white/80 hover:bg-white/20"
              >
                💬 Chat
              </button>
            </li>
          ))}
        </ul>
        {(friends.data?.outgoing.length ?? 0) > 0 && (
          <p className="mt-2 text-[11px] text-white/40">
            Pending: {friends.data!.outgoing.map((o) => o.user.name).join(', ')}
          </p>
        )}
      </section>

      {(shares.data?.incoming.length ?? 0) > 0 && (
        <section>
          <h4 className="text-[11px] font-bold uppercase tracking-wide text-white/45">
            Sharing location
          </h4>
          <ul className="mt-2 space-y-2">
            {shares.data!.incoming.map((s) => (
              <li
                key={s.id}
                className="flex items-center justify-between rounded-2xl bg-white/5 px-3 py-2.5"
              >
                <div>
                  <p className="text-sm text-white">
                    {s.user?.name ?? 'Friend'}{' '}
                    <span className="text-[11px] text-white/40">
                      {s.share_type === 'im_here' ? 'is here' : 'is heading out'}
                    </span>
                  </p>
                  {s.signalLost && <p className="text-[11px] text-amber-400">signal lost</p>}
                </div>
                {s.last_known_lat != null && s.last_known_lng != null && (
                  <button
                    onClick={() => onFocusShare(s.last_known_lat!, s.last_known_lng!)}
                    className="rounded-lg bg-white/10 px-3 py-1.5 text-xs text-white/80 hover:bg-white/20"
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

/* --------------------------------- Chat --------------------------------- */

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
      <div className="thin-scroll flex flex-1 flex-col-reverse overflow-y-auto p-4">
        <div className="space-y-2">
          {(messages.data?.messages ?? []).map((m) => (
            <div
              key={m.id}
              className={`flex ${m.sender_id === meId ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[75%] rounded-2xl px-3.5 py-2 text-sm ${
                  m.sender_id === meId
                    ? 'bg-accent font-medium text-white'
                    : 'bg-white/10 text-white'
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
          className="flex-1 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/35 outline-none focus:border-accent"
        />
        <button
          type="submit"
          disabled={send.isPending || !draft.trim()}
          className="btn-accent rounded-xl px-4 text-sm font-bold disabled:opacity-40"
        >
          Send
        </button>
      </form>
    </>
  )
}
