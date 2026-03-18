import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CanvasLogEntry, NodeType } from '../store/canvasStore'

function PaletteItem(props: { label: string; type: NodeType }) {
  const { label, type } = props
  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('application/flow-canvas-node', type)
        e.dataTransfer.effectAllowed = 'move'
      }}
      className="cursor-grab select-none rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 hover:border-slate-700 active:cursor-grabbing"
      title="拖到画布中添加节点"
    >
      {label}
    </div>
  )
}

function formatLogTime(ts: number): string {
  const d = new Date(ts)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`
}

function sanitizeResult(value: unknown): unknown {
  if (!value) return null
  if (Array.isArray(value)) {
    const arr = value.map((v) => sanitizeResult(v)).filter((v) => v !== null)
    return arr.length > 0 ? arr : null
  }
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>
    const next: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(obj)) {
      // 不展示任何 url 字段（imageUrl / videoUrl / source 等）
      if (/url/i.test(k) || k === 'source' || k === 'sourceImageUrl') continue
      const sv = sanitizeResult(v)
      if (sv !== null) next[k] = sv
    }
    return Object.keys(next).length > 0 ? next : null
  }
  return value
}

export function LeftPanel(props: {
  collapsed: boolean
  toggleCollapsed: () => void
  openFavorites: () => void
  apiBaseUrl: string
  onCopyApiBaseUrl: () => Promise<void>
  onOpenApiBaseUrl: () => void
  logs: CanvasLogEntry[]
  clearLogs: () => void
  globalError: string | null
  apiError: string | null
}) {
  const {
    collapsed,
    toggleCollapsed,
    openFavorites,
    apiBaseUrl,
    onCopyApiBaseUrl,
    onOpenApiBaseUrl,
    logs,
    clearLogs,
    globalError,
    apiError,
  } = props

  const [tipsOpen, setTipsOpen] = useState(false)
  const tipsButtonRef = useRef<HTMLButtonElement | null>(null)
  const tipsPopoverRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!tipsOpen) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setTipsOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [tipsOpen])

  useEffect(() => {
    if (!tipsOpen) return
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node | null
      if (!target) return
      if (tipsPopoverRef.current?.contains(target)) return
      if (tipsButtonRef.current?.contains(target)) return
      setTipsOpen(false)
    }
    window.addEventListener('pointerdown', onPointerDown)
    return () => window.removeEventListener('pointerdown', onPointerDown)
  }, [tipsOpen])

  const renderLogLine = useCallback((log: CanvasLogEntry) => {
    const actionLabel = (() => {
      if (!log.action) return ''
      switch (log.action) {
        case 'repaint_local':
          return '局部重绘'
        case 'erase':
          return '消除笔'
        case 'repaint_text':
          return '文字重绘'
        case 'tweak':
          return '画面微调'
        case 'generate_video':
          return '生成视频'
        default:
          return log.action
      }
    })()

    const safeResult = sanitizeResult(log.result)
    const tone =
      log.level === 'error'
        ? 'text-rose-200'
        : log.level === 'success'
          ? 'text-emerald-200'
          : 'text-slate-200'
    const badge =
      log.level === 'error'
        ? 'bg-rose-500/10 border-rose-500/30 text-rose-200'
        : log.level === 'success'
          ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200'
          : 'bg-slate-800/60 border-slate-700/60 text-slate-200'

    return (
      <div key={log.id} className="space-y-1 rounded-xl border border-slate-800 bg-slate-950/40 p-2">
        <div className="flex items-center justify-between gap-2 text-[11px] text-slate-500">
          <div className="flex min-w-0 items-center gap-2">
            <span className="tabular-nums">{formatLogTime(log.createdAt)}</span>
            <span className={`shrink-0 rounded-full border px-2 py-0.5 ${badge}`}>{log.status}</span>
            {log.nodeId ? (
              <span className="truncate text-slate-400">
                {log.nodeType ?? ''} · {log.nodeId}
                {actionLabel ? ` · ${actionLabel}` : ''}
              </span>
            ) : (
              <span className="truncate text-slate-400">{log.scope}</span>
            )}
          </div>
        </div>
        <div className={`text-[12px] ${tone}`}>{log.message}</div>
        {safeResult ? (
          <div className="break-all font-mono text-[11px] text-slate-400">{JSON.stringify(safeResult)}</div>
        ) : null}
      </div>
    )
  }, [])

  const errorText = globalError ?? apiError
  const palette = useMemo(
    () => (
      <div className="mt-4">
        <div className="text-xs font-semibold text-slate-300">节点</div>
        <div className="mt-2 space-y-2">
          <PaletteItem label="Text Input" type="text_input" />
          <PaletteItem label="LLM Generate" type="llm_generate" />
          <PaletteItem label="Image" type="image" />
        </div>
      </div>
    ),
    [],
  )

  return (
    <aside
      className={[
        'shrink-0 border-r border-slate-800 bg-slate-950/60',
        collapsed ? 'w-14' : 'w-72',
      ].join(' ')}
    >
      <div className={collapsed ? 'p-2' : 'p-4'}>
        <div
          className={[
            'flex justify-between gap-3',
            collapsed ? 'items-start' : 'h-12 items-center border-b border-slate-800/80 px-1',
          ].join(' ')}
        >
          {collapsed ? null : (
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-slate-100">AI Agent 画布</div>
            </div>
          )}

          <div className={[collapsed ? 'flex flex-col gap-2' : 'flex items-center gap-2'].join(' ')}>
            <button
              type="button"
              onClick={toggleCollapsed}
              className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-800 bg-slate-950/60 text-slate-100 hover:border-slate-700"
              title={collapsed ? '展开左侧栏' : '折叠左侧栏'}
              aria-label={collapsed ? '展开左侧栏' : '折叠左侧栏'}
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5 text-slate-200" aria-hidden="true">
                <path fill="currentColor" d="M4 6h16v2H4V6Zm0 5h10v2H4v-2Zm0 5h16v2H4v-2Zm12-6 4 3-4 3v-6Z" />
              </svg>
            </button>

            <div className="relative">
              <button
                type="button"
                ref={tipsButtonRef}
                onClick={() => setTipsOpen((v) => !v)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-800 bg-slate-950/60 text-slate-100 hover:border-slate-700"
                title="操作提示"
                aria-label="操作提示"
              >
                <svg viewBox="0 0 24 24" className="h-5 w-5 text-slate-200" aria-hidden="true">
                  <path
                    fill="currentColor"
                    d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm0 15a1.1 1.1 0 1 1 0 2.2A1.1 1.1 0 0 1 12 17Zm1.2-4.6c-.9.4-1.2.8-1.2 1.6v.3h-2v-.5c0-1.5.7-2.5 2-3.1.9-.4 1.3-.9 1.3-1.6 0-.9-.7-1.6-1.8-1.6-1 0-1.7.5-2 1.4l-1.9-.8C8.2 6.2 9.7 5 11.9 5c2.5 0 4.1 1.5 4.1 3.5 0 1.6-.9 2.7-2.8 3.4Z"
                  />
                </svg>
              </button>

              {tipsOpen ? (
                <div
                  ref={tipsPopoverRef}
                  className={[
                    'absolute left-1/2 top-full z-50 mt-2 w-[360px] -translate-x-1/2',
                    'overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/95 shadow-2xl shadow-black/40 backdrop-blur',
                    'origin-top transition will-change-transform',
                    "before:absolute before:left-1/2 before:top-0 before:h-3 before:w-3 before:-translate-x-1/2 before:-translate-y-1/2 before:rotate-45 before:border before:border-slate-800 before:bg-slate-950/95 before:content-['']",
                  ].join(' ')}
                  role="dialog"
                  aria-modal="false"
                  aria-label="tips popover"
                >
                  <div className="flex items-center justify-between border-b border-slate-800 px-3 py-2">
                    <div className="text-[11px] font-semibold text-slate-200">操作提示</div>
                    <button
                      type="button"
                      onClick={() => setTipsOpen(false)}
                      className="rounded-lg px-2 py-1 text-[11px] text-slate-300 hover:bg-slate-800/40"
                    >
                      关闭
                    </button>
                  </div>

                  <div className="space-y-3 p-3 text-sm text-slate-200">
                    <div className="rounded-2xl border border-slate-800 bg-slate-950/50 p-3">
                      <div className="text-[11px] font-semibold text-slate-300">选择 / 移动</div>
                      <div className="mt-2 space-y-2 text-[13px] text-slate-100">
                        <div className="flex items-start gap-3">
                          <span className="mt-0.5 inline-flex h-6 w-10 items-center justify-center rounded-lg border border-slate-800 bg-slate-950/60 text-[11px] text-slate-200">
                            鼠标
                          </span>
                          <div>
                            <div className="font-semibold">拖拽空白处</div>
                            <div className="text-[12px] text-slate-400">框选多个节点（多选用框选）</div>
                          </div>
                        </div>
                        <div className="flex items-start gap-3">
                          <span className="mt-0.5 inline-flex h-6 w-10 items-center justify-center rounded-lg border border-slate-800 bg-slate-950/60 text-[11px] text-slate-200">
                            拖动
                          </span>
                          <div>
                            <div className="font-semibold">拖动任意选中节点</div>
                            <div className="text-[12px] text-slate-400">整体移动（选中多个时）</div>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-slate-800 bg-slate-950/50 p-3">
                      <div className="text-[11px] font-semibold text-slate-300">视图</div>
                      <div className="mt-2 space-y-2 text-[13px] text-slate-100">
                        <div className="flex items-start gap-3">
                          <span className="mt-0.5 inline-flex h-6 w-10 items-center justify-center rounded-lg border border-slate-800 bg-slate-950/60 text-[11px] text-slate-200">
                            ␠
                          </span>
                          <div>
                            <div className="font-semibold">Space + 拖拽</div>
                            <div className="text-[12px] text-slate-400">平移画布</div>
                          </div>
                        </div>
                        <div className="flex items-start gap-3">
                          <span className="mt-0.5 inline-flex h-6 w-10 items-center justify-center rounded-lg border border-slate-800 bg-slate-950/60 text-[11px] text-slate-200">
                            ⌀
                          </span>
                          <div>
                            <div className="font-semibold">滚轮</div>
                            <div className="text-[12px] text-slate-400">缩放（触控板双指同理）</div>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="text-[11px] text-slate-500">提示：按 ESC 或点击外部可关闭。</div>
                  </div>
                </div>
              ) : null}
            </div>

            <button
              type="button"
              onClick={openFavorites}
              className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-800 bg-slate-950/60 text-slate-100 hover:border-slate-700"
              title="打开收藏夹"
              aria-label="打开收藏夹"
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5 text-amber-200" aria-hidden="true">
                <path
                  fill="currentColor"
                  d="M12 17.3 6.8 20a1 1 0 0 1-1.5-1.1l1-5.7-4.2-4A1 1 0 0 1 2.7 7l5.8-.8 2.6-5.2a1 1 0 0 1 1.8 0l2.6 5.2 5.8.8a1 1 0 0 1 .6 1.7l-4.2 4 1 5.7A1 1 0 0 1 17.2 20L12 17.3Z"
                />
              </svg>
            </button>
          </div>
        </div>

        {collapsed ? null : (
          <>
            {palette}

            <div className="mt-6 overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/35">
              <div className="flex items-center justify-between border-b border-slate-800/80 px-3 py-2">
                <div className="text-[11px] font-semibold text-slate-300">后端接口</div>
                <div className="text-[10px] text-slate-500">API Base URL</div>
              </div>
              <div className="flex items-center justify-between gap-2 px-3 py-2">
                <div className="min-w-0">
                  <div className="truncate font-mono text-[11px] text-slate-300">{apiBaseUrl}</div>
                  <div className="mt-0.5 text-[10px] text-slate-500">默认：`http://localhost:3001`</div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void onCopyApiBaseUrl()}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-slate-800 bg-slate-950/60 text-slate-200 hover:border-slate-700"
                    title="复制"
                    aria-label="复制"
                  >
                    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
                      <path
                        fill="currentColor"
                        d="M8 7a3 3 0 0 1 3-3h7a3 3 0 0 1 3 3v10a3 3 0 0 1-3 3h-7a3 3 0 0 1-3-3V7Zm3-1a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h7a1 1 0 0 0 1-1V7a1 1 0 0 0-1-1h-7ZM4 8a3 3 0 0 1 3-3h1v2H7a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1v-1h2v1a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3V8Z"
                      />
                    </svg>
                  </button>
                  <button
                    type="button"
                    onClick={onOpenApiBaseUrl}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-slate-800 bg-slate-950/60 text-slate-200 hover:border-slate-700"
                    title="打开"
                    aria-label="打开"
                  >
                    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
                      <path
                        fill="currentColor"
                        d="M14 3h7v7h-2V6.4l-9.3 9.3-1.4-1.4L17.6 5H14V3ZM5 5h6v2H7a0 0 0 0 0 0 0v10a2 2 0 0 0 2 2h10a0 0 0 0 0 0 0v-4h2v4a2 2 0 0 1-2 2H9a4 4 0 0 1-4-4V7a2 2 0 0 1 2-2Z"
                      />
                    </svg>
                  </button>
                </div>
              </div>
            </div>

            <div className="mt-4">
              <div className="flex items-center justify-between">
                <div className="text-xs font-semibold text-slate-300">日志</div>
                <button
                  type="button"
                  onClick={clearLogs}
                  className="rounded-lg border border-slate-800 bg-slate-950/50 px-2 py-1 text-[11px] font-semibold text-slate-200 hover:border-slate-700"
                  title="清空日志"
                >
                  清空
                </button>
              </div>
              <div className="mt-2 overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/35">
                <div
                  className={[
                    'max-h-[280px] space-y-2 overflow-auto p-2',
                    '[&::-webkit-scrollbar]:w-1.5',
                    '[&::-webkit-scrollbar-track]:bg-transparent',
                    '[&::-webkit-scrollbar-thumb]:rounded-full',
                    '[&::-webkit-scrollbar-thumb]:bg-slate-700/60',
                    'hover:[&::-webkit-scrollbar-thumb]:bg-slate-600/70',
                  ].join(' ')}
                >
                  {logs.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-slate-800 bg-slate-950/30 px-3 py-6 text-center text-xs text-slate-400">
                      暂无日志。运行节点/图片操作后会在这里显示执行过程。
                    </div>
                  ) : (
                    logs.slice(-60).map(renderLogLine)
                  )}
                </div>
              </div>
            </div>

            {errorText ? (
              <div className="mt-3 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
                {errorText}
                <div className="mt-1 text-[11px] text-rose-200/80">可修改连线/Prompt 后再次点击 Run 重试。</div>
              </div>
            ) : null}
          </>
        )}
      </div>
    </aside>
  )
}

