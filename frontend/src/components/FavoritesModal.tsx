import { useEffect, useMemo } from 'react'
import { useCanvasStore, type FavoriteItem } from '../store/canvasStore'

function FavoriteCard(props: {
  item: FavoriteItem
  onPreview: () => void
  onAddToChat: () => void
  onRemove: () => void
}) {
  const { item } = props
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/50">
      <button
        type="button"
        onClick={props.onPreview}
        className="block w-full bg-black/20"
        title="预览"
      >
        <img src={item.url} alt="fav" className="h-32 w-full object-cover" />
      </button>
      <div className="space-y-2 p-3">
        <div className="line-clamp-2 break-all text-[11px] text-slate-400">
          {item.url}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={props.onAddToChat}
            className="flex-1 rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-1.5 text-xs font-semibold text-slate-100 hover:border-slate-700"
          >
            加入会话
          </button>
          <button
            type="button"
            onClick={props.onRemove}
            className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-1.5 text-xs font-semibold text-rose-200 hover:border-rose-500/50"
          >
            删除
          </button>
        </div>
      </div>
    </div>
  )
}

export function FavoritesModal() {
  const favoritesOpen = useCanvasStore((s) => s.favoritesOpen)
  const favorites = useCanvasStore((s) => s.favorites)
  const closeFavorites = useCanvasStore((s) => s.closeFavorites)
  const removeFavorite = useCanvasStore((s) => s.removeFavorite)
  const appendChatMessage = useCanvasStore((s) => s.appendChatMessage)
  const openPreview = useCanvasStore((s) => s.openPreview)

  useEffect(() => {
    if (!favoritesOpen) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeFavorites()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [closeFavorites, favoritesOpen])

  const sorted = useMemo(
    () => [...favorites].sort((a, b) => b.createdAt - a.createdAt),
    [favorites],
  )

  if (!favoritesOpen) return null

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="favorites"
      onPointerDown={closeFavorites}
    >
      <div
        className="w-full max-w-5xl overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/90 shadow-2xl"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
          <div className="text-sm font-semibold text-slate-100">收藏夹</div>
          <button
            type="button"
            onClick={closeFavorites}
            className="rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-1.5 text-xs font-semibold text-slate-100 hover:border-slate-700"
          >
            关闭
          </button>
        </div>

        <div className="max-h-[72vh] overflow-auto p-4">
          {sorted.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-800 bg-slate-950/30 px-3 py-10 text-center text-sm text-slate-400">
              还没有收藏。你可以在图片节点里点击“收藏”把当前图片加入收藏夹。
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
              {sorted.map((item) => (
                <FavoriteCard
                  key={item.id}
                  item={item}
                  onPreview={() => openPreview({ title: '收藏预览', imageUrl: item.url })}
                  onAddToChat={() =>
                    appendChatMessage({ role: 'user', kind: 'image', imageUrl: item.url })
                  }
                  onRemove={() => removeFavorite(item.id)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

