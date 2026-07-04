export interface Toast {
  id: number
  text: string
}

export function Toasts({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: number) => void }) {
  return (
    <div className="pointer-events-none fixed left-1/2 top-6 z-[60] flex -translate-x-1/2 flex-col gap-2">
      {toasts.map((t) => (
        <button
          key={t.id}
          onClick={() => onDismiss(t.id)}
          className="animate-float-in pointer-events-auto rounded-2xl panel-solid px-5 py-3 text-sm font-medium text-white shadow-2xl"
        >
          {t.text}
        </button>
      ))}
    </div>
  )
}
