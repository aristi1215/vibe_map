export interface Toast {
  id: number
  text: string
}

export function Toasts({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: number) => void }) {
  return (
    <div className="pointer-events-none fixed bottom-6 left-1/2 z-[60] flex -translate-x-1/2 flex-col gap-2">
      {toasts.map((t) => (
        <button
          key={t.id}
          onClick={() => onDismiss(t.id)}
          className="pointer-events-auto rounded-2xl border border-white/10 bg-zinc-900/95 px-5 py-3 text-sm text-white shadow-2xl backdrop-blur-md"
        >
          {t.text}
        </button>
      ))}
    </div>
  )
}
