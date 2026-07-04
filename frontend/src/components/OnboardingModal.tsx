import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'

interface Props {
  initialTags?: string[]
  onDone: () => void
  /** true when the user has already onboarded and is just editing interests */
  editing?: boolean
}

const MIN_INTERESTS = 3

export function OnboardingModal({ initialTags = [], onDone, editing = false }: Props) {
  const queryClient = useQueryClient()
  const [selected, setSelected] = useState<Set<string>>(new Set(initialTags))

  const { data, isLoading } = useQuery({
    queryKey: ['vocabulary'],
    queryFn: () => api<{ tags: string[] }>('/api/users/interests/vocabulary'),
  })

  const save = useMutation({
    mutationFn: () =>
      api('/api/users/interests', {
        method: 'PUT',
        body: JSON.stringify({
          interests: [...selected].map((tag) => ({ tag, weight: 1 })),
        }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['me'] })
      queryClient.invalidateQueries({ queryKey: ['recommendations'] })
      onDone()
    },
  })

  const toggle = (tag: string) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(tag)) next.delete(tag)
      else next.add(tag)
      return next
    })

  const remaining = Math.max(0, MIN_INTERESTS - selected.size)
  const canSave = selected.size >= MIN_INTERESTS && !save.isPending

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-md">
      <div className="animate-pop-in flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-2.5xl panel-solid shadow-panel">
        {/* header */}
        <div className="relative overflow-hidden px-8 pt-8 pb-6">
          <div className="brand-gradient pointer-events-none absolute -right-20 -top-24 h-56 w-56 rounded-full opacity-[0.18] blur-3xl" />
          <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-white/45">
            {editing ? 'Your interests' : 'Welcome to VibeMap'}
          </p>
          <h2 className="mt-2 text-3xl font-bold tracking-tight text-white">
            What are you <span className="brand-text">into</span>?
          </h2>
          <p className="mt-2 max-w-md text-sm text-white/55">
            Pick at least {MIN_INTERESTS}. We blend these with your mood to surface the spots you'll
            actually love. Change them anytime.
          </p>
        </div>

        {/* tag cloud */}
        <div className="thin-scroll flex flex-1 flex-wrap content-start gap-2 overflow-y-auto px-8 pb-4">
          {isLoading &&
            Array.from({ length: 18 }).map((_, i) => (
              <span key={i} className="skeleton h-9 w-24 rounded-full" />
            ))}
          {(data?.tags ?? []).map((tag) => {
            const isSelected = selected.has(tag)
            return (
              <button
                key={tag}
                onClick={() => toggle(tag)}
                className={`rounded-full border px-4 py-2 text-sm font-medium capitalize transition-all duration-150 ${
                  isSelected
                    ? 'btn-accent border-transparent shadow-soft'
                    : 'border-white/[0.1] bg-white/[0.04] text-white/70 hover:border-white/25 hover:text-white'
                }`}
              >
                {isSelected ? '✓ ' : ''}
                {tag}
              </button>
            )
          })}
        </div>

        {/* footer */}
        <div className="flex items-center justify-between gap-4 border-t hairline px-8 py-5">
          <span className="text-sm text-white/50">
            {selected.size} selected
            {remaining > 0 && (
              <span className="text-white/40"> · {remaining} more to go</span>
            )}
          </span>
          <div className="flex items-center gap-3">
            {editing && (
              <button
                onClick={onDone}
                className="rounded-xl px-4 py-2.5 text-sm font-medium text-white/60 transition hover:text-white"
              >
                Cancel
              </button>
            )}
            <button
              disabled={!canSave}
              onClick={() => save.mutate()}
              className="btn-accent rounded-xl px-7 py-2.5 text-sm font-bold shadow-soft disabled:cursor-not-allowed disabled:opacity-40"
            >
              {save.isPending ? 'Saving…' : editing ? 'Save' : 'Start exploring →'}
            </button>
          </div>
        </div>
        {save.isError && (
          <p className="px-8 pb-4 text-sm text-rose-400">{(save.error as Error).message}</p>
        )}
      </div>
    </div>
  )
}
