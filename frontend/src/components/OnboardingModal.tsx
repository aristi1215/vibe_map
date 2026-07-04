import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'

interface Props {
  initialTags?: string[]
  onDone: () => void
}

export function OnboardingModal({ initialTags = [], onDone }: Props) {
  const queryClient = useQueryClient()
  const [selected, setSelected] = useState<Set<string>>(new Set(initialTags))

  const { data } = useQuery({
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
      onDone()
    },
  })

  const toggle = (tag: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(tag)) next.delete(tag)
      else next.add(tag)
      return next
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="w-full max-w-2xl rounded-3xl border border-white/10 bg-zinc-900 p-8 shadow-2xl">
        <h2 className="text-2xl font-bold text-white">What do you love?</h2>
        <p className="mt-1 text-sm text-zinc-400">
          Pick at least 3 interests. Your mood + these interests drive what the map highlights for
          you. You can change them anytime.
        </p>
        <div className="mt-6 flex max-h-[45vh] flex-wrap gap-2 overflow-y-auto">
          {(data?.tags ?? []).map((tag) => {
            const isSelected = selected.has(tag)
            return (
              <button
                key={tag}
                onClick={() => toggle(tag)}
                className={`rounded-full border px-3.5 py-1.5 text-sm capitalize transition-all ${
                  isSelected
                    ? 'border-emerald-400 bg-emerald-400/20 text-emerald-300'
                    : 'border-white/10 bg-white/5 text-zinc-300 hover:border-white/30'
                }`}
              >
                {tag}
              </button>
            )
          })}
        </div>
        <div className="mt-8 flex items-center justify-between">
          <span className="text-sm text-zinc-500">{selected.size} selected</span>
          <button
            disabled={selected.size < 3 || save.isPending}
            onClick={() => save.mutate()}
            className="rounded-xl bg-emerald-500 px-6 py-2.5 font-semibold text-zinc-900 transition-all hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {save.isPending ? 'Saving…' : 'Start exploring'}
          </button>
        </div>
        {save.isError && (
          <p className="mt-3 text-sm text-rose-400">{(save.error as Error).message}</p>
        )}
      </div>
    </div>
  )
}
