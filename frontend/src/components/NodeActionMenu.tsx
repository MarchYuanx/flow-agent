import { useEffect, useMemo, useRef } from 'react'

export type NodeActionItem = {
  id: string
  label: string
  danger?: boolean
  disabled?: boolean
  onClick: () => void
}

export function NodeActionMenu(props: {
  anchor: { x: number; y: number }
  title?: string
  actions: NodeActionItem[]
  onClose: () => void
}) {
  const { anchor, title, actions, onClose } = props
  const containerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      const el = containerRef.current
      if (!el) return
      if (e.target instanceof Node && el.contains(e.target)) return
      onClose()
    }
    window.addEventListener('pointerdown', onPointerDown)
    return () => window.removeEventListener('pointerdown', onPointerDown)
  }, [onClose])

  const style = useMemo(() => {
    // 轻量防溢出：菜单默认向右下展开，靠近边缘时自动向内收一点
    const margin = 12
    const width = 240
    const height = 40 + actions.length * 36
    const maxX = window.innerWidth - width - margin
    const maxY = window.innerHeight - height - margin
    return {
      left: Math.max(margin, Math.min(anchor.x, maxX)),
      top: Math.max(margin, Math.min(anchor.y, maxY)),
    }
  }, [anchor.x, anchor.y, actions.length])

  return (
    <div
      ref={containerRef}
      style={style}
      className={[
        'fixed z-50 w-60 overflow-hidden rounded-xl',
        'border border-slate-800 bg-slate-950/90 text-slate-100 shadow-xl',
        'backdrop-blur',
      ].join(' ')}
      role="menu"
      aria-label={title ?? 'node actions'}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {title ? (
        <div className="border-b border-slate-800 px-3 py-2 text-xs font-semibold text-slate-300">
          {title}
        </div>
      ) : null}

      <div className="py-1">
        {actions.map((a) => (
          <button
            key={a.id}
            type="button"
            role="menuitem"
            disabled={a.disabled}
            onClick={() => {
              if (a.disabled) return
              a.onClick()
              onClose()
            }}
            className={[
              'flex w-full items-center justify-between px-3 py-2 text-left text-sm',
              a.danger
                ? 'text-rose-200 hover:bg-rose-500/10'
                : 'text-slate-100 hover:bg-slate-800/40',
              'disabled:cursor-not-allowed disabled:opacity-50',
            ].join(' ')}
          >
            <span>{a.label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

