import { useEffect } from 'react'

export function ImagePreviewModal(props: {
  title?: string
  imageUrl: string
  onClose: () => void
  onCopyUrl?: () => void
  isFavorite?: boolean
  onToggleFavorite?: () => void
}) {
  const { title, imageUrl, onClose, onCopyUrl, isFavorite, onToggleFavorite } = props

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={title ?? 'image preview'}
      onPointerDown={onClose}
    >
      <div
        className="w-full max-w-6xl overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/90 shadow-2xl"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
          <div className="text-sm font-semibold text-slate-100">
            {title ?? '预览'}
          </div>
          <div className="flex items-center gap-2">
            {onToggleFavorite ? (
              <button
                type="button"
                onClick={onToggleFavorite}
                className={[
                  'inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-semibold',
                  isFavorite
                    ? 'border-amber-300/40 bg-amber-300/10 text-amber-100'
                    : 'border-slate-800 bg-slate-950/60 text-slate-100 hover:border-slate-700',
                ].join(' ')}
                title={isFavorite ? '已收藏（点击取消）' : '加入收藏'}
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
                  <path
                    fill="currentColor"
                    d="M12 17.3 6.8 20a1 1 0 0 1-1.5-1.1l1-5.7-4.2-4A1 1 0 0 1 2.7 7l5.8-.8 2.6-5.2a1 1 0 0 1 1.8 0l2.6 5.2 5.8.8a1 1 0 0 1 .6 1.7l-4.2 4 1 5.7A1 1 0 0 1 17.2 20L12 17.3Z"
                  />
                </svg>
                {isFavorite ? '已收藏' : '收藏'}
              </button>
            ) : null}
            {onCopyUrl ? (
              <button
                type="button"
                onClick={onCopyUrl}
                className="rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-1.5 text-xs font-semibold text-slate-100 hover:border-slate-700"
              >
                复制URL
              </button>
            ) : null}
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-1.5 text-xs font-semibold text-slate-100 hover:border-slate-700"
            >
              关闭
            </button>
          </div>
        </div>

        <div className="p-4">
          <div className="overflow-hidden rounded-xl border border-slate-800 bg-black/20">
            <img
              src={imageUrl}
              alt="preview"
              className="max-h-[78vh] w-full object-contain"
            />
          </div>
        </div>
      </div>
    </div>
  )
}

