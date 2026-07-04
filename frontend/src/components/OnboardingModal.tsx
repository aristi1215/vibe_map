import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'

interface Props {
  initialTags?: string[]
  onDone: () => void
}

/** Full-screen interest picker (onboarding + editing). */
export function OnboardingScreen({ initialTags = [], onDone }: Props) {
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
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 backdrop-blur-sm sm:items-center sm:p-6">
      <div className="animate-pop-in flex max-h-[90vh] w-full max-w-2xl flex-col rounded-t-[2rem] bg-white p-7 shadow-2xl sm:rounded-[2rem]">
        <div className="text-center">
          <span className="text-4xl">✨</span>
          <h2 className="mt-2 text-2xl font-extrabold text-slate-900">What do you love?</h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">
            Pick at least 3 interests. Your mood + these interests drive what the map highlights
            for you. You can change them anytime.
          </p>
        </div>
        <div className="mt-6 flex flex-1 flex-wrap content-start justify-center gap-2 overflow-y-auto">
          {(data?.tags ?? []).map((tag) => {
            const isSelected = selected.has(tag)
            return (
              <button
                key={tag}
                onClick={() => toggle(tag)}
                className={`rounded-full border-2 px-4 py-2 text-sm font-bold capitalize transition-all ${
                  isSelected
                    ? 'border-orange-400 bg-orange-400 text-white shadow-md'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-orange-300'
                }`}
              >
                {tag}
              </button>
            )
          })}
        </div>
        <div className="mt-7 flex items-center justify-between">
          <span className="text-sm font-bold text-slate-400">{selected.size} selected</span>
          <button
            disabled={selected.size < 3 || save.isPending}
            onClick={() => save.mutate()}
            className="rounded-full bg-gradient-to-r from-orange-400 to-pink-500 px-7 py-3 font-bold text-white shadow-lg transition-transform hover:scale-105 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {save.isPending ? 'Saving…' : 'Start exploring'}
          </button>
        </div>
        {save.isError && (
          <p className="mt-3 text-sm font-medium text-rose-500">
            {(save.error as Error).message}
          </p>
        )}
      </div>
    </div>
  )
}
