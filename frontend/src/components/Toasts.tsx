export interface Toast {
  id: number
  text: string
}

/** Top-center toast stack for realtime alerts. */
export function Toasts({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: number) => void }) {
  return (
    <div className="pointer-events-none fixed left-1/2 top-20 z-[60] flex -translate-x-1/2 flex-col gap-2">
      {toasts.map((t) => (
        <button
          key={t.id}
          onClick={() => onDismiss(t.id)}
          className="animate-pop-in pointer-events-auto rounded-full border border-orange-100 bg-white px-5 py-3 text-sm font-bold text-slate-700 shadow-xl"
        >
          {t.text}
        </button>
      ))}
    </div>
  )
}
