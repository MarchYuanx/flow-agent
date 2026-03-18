import { Handle, Position, type NodeProps } from '@xyflow/react'
import { useCallback, useMemo, useRef, useState } from 'react'
import {
  useCanvasStore,
  type ImageData,
  type ImageNodeType,
} from '../store/canvasStore'
import type { ImageAction } from '../hooks/useApi'
import { StatusPill } from '../components/StatusPill'

export function ImageNode(props: NodeProps<ImageNodeType>) {
  const { id, data, selected } = props
  const updateNodeData = useCanvasStore((s) => s.updateNodeData)
  const appendChatMessage = useCanvasStore((s) => s.appendChatMessage)
  const deleteNode = useCanvasStore((s) => s.deleteNode)
  const runImageNodeAction = useCanvasStore((s) => s.runImageNodeAction)
  const toggleFavorite = useCanvasStore((s) => s.toggleFavorite)
  const isFavorite = useCanvasStore((s) => s.isFavorite)
  const openPreview = useCanvasStore((s) => s.openPreview)
  const [moreOpen, setMoreOpen] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [composer, setComposer] = useState<{
    action: ImageAction
    label: string
    prompt: string
    open: boolean
  } | null>(null)

  const activeUrl = useMemo(() => {
    const idx = Math.max(0, Math.min(data.activeIndex, data.images.length - 1))
    return data.images[idx] ?? ''
  }, [data.activeIndex, data.images])

  const task = data.aiTask
  const taskRunning = task?.status === 'running'

  const removeActiveImage = useCallback(() => {
    updateNodeData(id, (prev) => {
      const typed = prev as ImageData
      const idx = Math.max(0, Math.min(typed.activeIndex, typed.images.length - 1))
      const nextImages = typed.images.slice()
      if (nextImages.length === 0) return typed
      nextImages.splice(idx, 1)
      const nextActive = Math.max(0, Math.min(idx, nextImages.length - 1))
      return {
        ...typed,
        images: nextImages,
        activeIndex: nextImages.length === 0 ? 0 : nextActive,
        errorMessage: undefined,
      }
    })
  }, [id, updateNodeData])

  const onChangeUrl = useCallback(
    (value: string) => {
      updateNodeData(id, (prev) => {
        const typed = prev as ImageData
        const idx = Math.max(0, Math.min(typed.activeIndex, typed.images.length - 1))
        const nextImages = typed.images.slice()
        if (nextImages.length === 0) {
          nextImages.push(value)
          return { ...typed, images: nextImages, activeIndex: 0, errorMessage: undefined }
        }
        nextImages[idx] = value
        return {
          ...typed,
          images: nextImages,
          errorMessage: undefined,
        }
      })
    },
    [id, updateNodeData],
  )

  const onUploadFiles = useCallback(
    (files: FileList | null) => {
      if (!files || files.length === 0) return
      const urls: string[] = []
      for (const f of Array.from(files)) {
        if (!f.type.startsWith('image/')) continue
        urls.push(URL.createObjectURL(f))
      }
      if (urls.length === 0) return

      updateNodeData(id, (prev) => {
        const typed = prev as ImageData
        const nextImages = [...typed.images, ...urls]
        return {
          ...typed,
          images: nextImages,
          activeIndex: Math.max(0, nextImages.length - urls.length),
          errorMessage: undefined,
        }
      })
    },
    [id, updateNodeData],
  )

  const onMockUpload = useCallback(() => {
    const seed = crypto.randomUUID().slice(0, 8)
    const url = `https://picsum.photos/seed/${encodeURIComponent(seed)}/960/540?watermark=AI画布-mock&prompt=mock`
    updateNodeData(id, (prev) => {
      const typed = prev as ImageData
      const nextImages = [...typed.images, url]
      return {
        ...typed,
        images: nextImages,
        activeIndex: Math.max(0, nextImages.length - 1),
        errorMessage: undefined,
      }
    })
  }, [id, updateNodeData])

  return (
    <div
      className={[
        'relative w-[340px] rounded-xl border bg-slate-900/70 shadow-sm backdrop-blur',
        selected ? 'border-amber-300/60' : 'border-slate-700/80',
      ].join(' ')}
    >
      <div className="flex items-center justify-between border-b border-slate-800 bg-gradient-to-r from-sky-500/10 to-transparent px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-sky-400/20 bg-sky-500/10">
            <svg viewBox="0 0 24 24" className="h-4 w-4 text-sky-200" aria-hidden="true">
              <path
                fill="currentColor"
                d="M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6Zm2 0v12h12V6H6Zm2 10 3-4 2 2 3-4 2 3v3H8Z"
              />
            </svg>
          </span>
          <div className="min-w-0">
            <div className="truncate text-[13px] font-semibold text-slate-100">{data.title}</div>
            <div className="truncate text-[11px] text-slate-400">
              图片节点 · {data.images.length} 张
              {data.lastAction ? ` · ${data.lastAction}` : ''}
            </div>
          </div>
        </div>
        <StatusPill status={data.status} />
      </div>

      <div className="space-y-3 px-3 py-3">
        <div>
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium text-slate-300">图片（支持多张）</label>
            <div className="flex items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => onUploadFiles(e.target.files)}
              />
              <button
                type="button"
                onPointerDown={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
                onClick={() => fileInputRef.current?.click()}
                className="nodrag rounded-lg border border-slate-800 bg-slate-950/50 px-2 py-1 text-[11px] font-semibold text-slate-100 hover:border-slate-700"
              >
                上传
              </button>
              <button
                type="button"
                onPointerDown={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
                onClick={onMockUpload}
                className="nodrag rounded-lg border border-slate-800 bg-slate-950/50 px-2 py-1 text-[11px] font-semibold text-slate-100 hover:border-slate-700"
                title="自动添加一张 mock 图片（用于演示）"
              >
                模拟上传
              </button>
            </div>
          </div>

          <input
            value={activeUrl}
            onChange={(e) => onChangeUrl(e.target.value)}
            onPointerDown={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            placeholder="https://..."
            className="nodrag nowheel mt-2 w-full rounded-lg border border-slate-700/80 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 outline-none focus:border-amber-300/60"
          />

          {data.images.length > 1 ? (
            <div className="nodrag mt-2 flex flex-wrap gap-2">
              {data.images.map((u, idx) => (
                <button
                  key={`${u}-${idx}`}
                  type="button"
                  onPointerDown={(e) => e.stopPropagation()}
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={() =>
                    updateNodeData(id, (prev) => {
                      const typed = prev as ImageData
                      return { ...typed, activeIndex: idx }
                    })
                  }
                  className={[
                    'overflow-hidden rounded-lg border',
                    idx === data.activeIndex ? 'border-amber-300/60' : 'border-slate-800',
                  ].join(' ')}
                  title={`第 ${idx + 1} 张`}
                >
                  <img src={u} alt={`thumb-${idx}`} className="h-10 w-10 object-cover" />
                </button>
              ))}
            </div>
          ) : null}

        </div>

        <div>
          <div className="text-xs font-medium text-slate-300">预览</div>
          {taskRunning && data.images.length > 1 ? (
            <div className="mt-2 overflow-hidden rounded-lg border border-slate-800 bg-slate-950/40">
              <div className="grid grid-cols-2 gap-2 p-2">
                {data.images.slice(0, 4).map((u, idx) => {
                  const p = task?.items?.[idx]?.progress ?? task?.progress ?? 1
                  return (
                    <div
                      key={`${u}-${idx}`}
                      className="relative h-20 overflow-hidden rounded-lg border border-slate-800 bg-slate-950/60"
                    >
                      <div className="absolute inset-0 animate-pulse bg-gradient-to-r from-slate-800/40 via-slate-700/30 to-slate-800/40" />
                      <div className="absolute inset-x-2 bottom-2 flex items-center justify-between text-[10px] text-slate-200">
                        <span>#{idx + 1}</span>
                        <span className="tabular-nums">{Math.min(99, p)}%</span>
                      </div>
                    </div>
                  )
                })}
              </div>

              <div className="border-t border-slate-800 px-3 py-2">
                <div className="flex items-center justify-between text-[11px] text-slate-300">
                  <span>生成中（共 {data.images.length} 张）</span>
                  <span className="tabular-nums">{Math.min(99, task?.progress ?? 1)}%</span>
                </div>
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
                  <div
                    className="h-full rounded-full bg-amber-300/70"
                    style={{ width: `${Math.min(99, task?.progress ?? 1)}%` }}
                  />
                </div>
              </div>
            </div>
          ) : taskRunning ? (
            <div className="mt-2 overflow-hidden rounded-lg border border-slate-800 bg-slate-950/40">
              <div className="relative h-44 w-full">
                <div className="absolute inset-0 animate-pulse bg-gradient-to-r from-slate-800/40 via-slate-700/30 to-slate-800/40" />
                <div className="absolute inset-x-3 bottom-3 rounded-xl border border-slate-800 bg-slate-950/70 p-3 backdrop-blur">
                  <div className="flex items-center justify-between text-[11px] text-slate-300">
                    <span>生成中</span>
                    <span className="tabular-nums">{Math.min(99, task?.progress ?? 1)}%</span>
                  </div>
                  <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
                    <div
                      className="h-full rounded-full bg-amber-300/70"
                      style={{ width: `${Math.min(99, task?.progress ?? 1)}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>
          ) : activeUrl.trim().length > 0 ? (
            <div className="relative mt-2 overflow-hidden rounded-lg border border-slate-800">
              <img
                src={activeUrl}
                alt="image"
                className="h-44 w-full object-cover"
              />
              <div
                className="nodrag absolute right-2 top-2 flex items-center gap-1 rounded-2xl border border-slate-800/80 bg-slate-950/70 p-1 shadow-lg shadow-black/30 backdrop-blur"
                onPointerDown={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
              >
                <button
                  type="button"
                  onClick={() => openPreview({ title: data.title, imageUrl: activeUrl })}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-xl text-slate-100 hover:bg-slate-800/40"
                  title="预览大图"
                  aria-label="预览大图"
                >
                  <svg viewBox="0 0 24 24" className="h-4 w-4 text-slate-200" aria-hidden="true">
                    <path
                      fill="currentColor"
                      d="M12 5c5.5 0 9.6 5 9.6 7s-4.1 7-9.6 7S2.4 14 2.4 12 6.5 5 12 5Zm0 2c-3.9 0-6.8 3.7-6.8 5s2.9 5 6.8 5 6.8-3.7 6.8-5-2.9-5-6.8-5Zm0 2.2A2.8 2.8 0 1 1 12 14.8a2.8 2.8 0 0 1 0-5.6Z"
                    />
                  </svg>
                </button>

                <button
                  type="button"
                  onClick={() =>
                    appendChatMessage({ role: 'user', kind: 'image', imageUrl: activeUrl })
                  }
                  className="inline-flex h-8 w-8 items-center justify-center rounded-xl text-slate-100 hover:bg-slate-800/40"
                  title="加入会话"
                  aria-label="加入会话"
                >
                  <svg viewBox="0 0 24 24" className="h-4 w-4 text-slate-200" aria-hidden="true">
                    <path
                      fill="currentColor"
                      d="M4 4h13a3 3 0 0 1 3 3v7a3 3 0 0 1-3 3H9l-4.4 2.2A1 1 0 0 1 3 18.5V7a3 3 0 0 1 3-3Zm0 3v9.9L8.6 15H17a1 1 0 0 0 1-1V7a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1Z"
                    />
                  </svg>
                </button>

                <button
                  type="button"
                  onClick={() => toggleFavorite(activeUrl)}
                  className={[
                    'inline-flex h-8 w-8 items-center justify-center rounded-xl hover:bg-slate-800/40',
                    isFavorite(activeUrl) ? 'text-amber-200' : 'text-slate-100',
                  ].join(' ')}
                  title={isFavorite(activeUrl) ? '已在收藏夹' : '加入收藏夹'}
                  aria-label={isFavorite(activeUrl) ? '已在收藏夹' : '加入收藏夹'}
                >
                  {isFavorite(activeUrl) ? (
                    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
                      <path
                        fill="currentColor"
                        d="M12 17.3 6.8 20a1 1 0 0 1-1.5-1.1l1-5.7-4.2-4A1 1 0 0 1 2.7 7l5.8-.8 2.6-5.2a1 1 0 0 1 1.8 0l2.6 5.2 5.8.8a1 1 0 0 1 .6 1.7l-4.2 4 1 5.7A1 1 0 0 1 17.2 20L12 17.3Z"
                      />
                    </svg>
                  ) : (
                    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
                      <path
                        fill="currentColor"
                        d="M12 3.4 14.2 9.6l6.6.6-5 4.3 1.5 6.4L12 18l-5.3 2.9 1.5-6.4-5-4.3 6.6-.6L12 3.4Zm0 4.7-1.3 3.6-.2.6-.7.1-3.7.3 2.8 2.4.5.4-.1.6-.8 3.5 3-1.7.6-.3.6.3 3 1.7-.8-3.5-.1-.6.5-.4 2.8-2.4-3.7-.3-.7-.1-.2-.6L12 8.1Z"
                      />
                    </svg>
                  )}
                </button>

                <button
                  type="button"
                  onClick={removeActiveImage}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-xl text-rose-200 hover:bg-rose-500/10"
                  title="删除当前图片"
                  aria-label="删除当前图片"
                >
                  <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
                    <path
                      fill="currentColor"
                      d="M9 3h6l1 2h4v2H4V5h4l1-2Zm1 6h2v9h-2V9Zm4 0h2v9h-2V9ZM7 9h2v9H7V9Z"
                    />
                  </svg>
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-2 rounded-lg border border-dashed border-slate-800 bg-slate-950/30 px-3 py-6 text-center text-xs text-slate-400">
              输入 URL 后显示预览
            </div>
          )}
        </div>

        {data.errorMessage ? (
          <div className="text-xs text-rose-300">{data.errorMessage}</div>
        ) : null}
      </div>

      {selected ? (
        <div
          className="nodrag absolute -top-12 left-1/2 z-10 -translate-x-1/2"
          onPointerDown={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div className="relative flex flex-nowrap items-center gap-1.5 whitespace-nowrap rounded-2xl border border-slate-800/80 bg-slate-950/85 px-1.5 py-1 shadow-xl shadow-black/30 backdrop-blur">
 
            <button
              type="button"
              onClick={() =>
                data.sourceAction && data.sourceImages && data.sourceImages.length > 0
                  ? runImageNodeAction({
                      nodeId: id,
                      action: data.sourceAction,
                      prompt: data.sourcePrompt,
                    })
                  : setComposer({
                      action: 'repaint_local',
                      label: '再次生成',
                      prompt: data.sourcePrompt ?? '',
                      open: true,
                    })
              }
              className="inline-flex h-8 shrink-0 items-center gap-1 whitespace-nowrap rounded-xl px-2.5 text-xs font-semibold text-slate-100 hover:bg-slate-800/50 active:bg-slate-800/70"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4 text-slate-200" aria-hidden="true">
                <path
                  fill="currentColor"
                  d="M12 6V3L8 7l4 4V8c2.8 0 5 2.2 5 5a5 5 0 1 1-9.6-2H5.2A7 7 0 1 0 12 6Z"
                />
              </svg>
              再次生成
            </button>
            <button
              type="button"
              onClick={() =>
                setComposer({ action: 'tweak', label: '超清', prompt: '超清', open: true })
              }
              className="inline-flex h-8 shrink-0 items-center gap-1 whitespace-nowrap rounded-xl px-2.5 text-xs font-semibold text-slate-100 hover:bg-slate-800/50 active:bg-slate-800/70"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4 text-slate-200" aria-hidden="true">
                <path
                  fill="currentColor"
                  d="M12 2l2.2 6.2L21 10l-6 3.7L16.8 21 12 17.4 7.2 21 9 13.7 3 10l6.8-1.8L12 2Z"
                />
              </svg>
              超清
            </button>
            <button
              type="button"
              onClick={() => runImageNodeAction({ nodeId: id, action: 'erase' })}
              className="inline-flex h-8 shrink-0 items-center gap-1 whitespace-nowrap rounded-xl px-2.5 text-xs font-semibold text-slate-100 hover:bg-slate-800/50 active:bg-slate-800/70"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4 text-slate-200" aria-hidden="true">
                <path
                  fill="currentColor"
                  d="M3 15.5 12.1 6.4a2 2 0 0 1 2.8 0l5.7 5.7a2 2 0 0 1 0 2.8L16.4 19H9.2L3 15.5Zm6.7 1.5h5.9l2.8-2.8-5.7-5.7-6.5 6.5 3.5 2Z"
                />
              </svg>
              抠图
            </button>

            <div className="mx-0.5 h-5 w-px bg-slate-800/80" />

            <button
              type="button"
              onClick={() => deleteNode(id)}
              className="inline-flex h-8 shrink-0 items-center gap-1 whitespace-nowrap rounded-xl px-2.5 text-xs font-semibold text-rose-200 hover:bg-rose-500/10 active:bg-rose-500/15"
              title="删除节点"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
                <path
                  fill="currentColor"
                  d="M9 3h6l1 2h4v2H4V5h4l1-2Zm1 6h2v9h-2V9Zm4 0h2v9h-2V9ZM7 9h2v9H7V9Z"
                />
              </svg>
              删除
            </button>

            <div className="mx-0.5 h-5 w-px bg-slate-800/80" />

            <button
              type="button"
              onClick={() => setMoreOpen((v) => !v)}
              className="inline-flex h-8 shrink-0 items-center justify-center whitespace-nowrap rounded-xl px-2.5 text-xs font-semibold text-slate-100 hover:bg-slate-800/50 active:bg-slate-800/70"
              aria-label="更多操作"
              title="更多"
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5 text-slate-200" aria-hidden="true">
                <path
                  fill="currentColor"
                  d="M6 10.8a1.2 1.2 0 1 1 0 2.4 1.2 1.2 0 0 1 0-2.4Zm6 0a1.2 1.2 0 1 1 0 2.4 1.2 1.2 0 0 1 0-2.4Zm6 0a1.2 1.2 0 1 1 0 2.4 1.2 1.2 0 0 1 0-2.4Z"
                />
              </svg>
            </button>

            {moreOpen ? (
              <div className="absolute right-0 top-11 w-44 overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/95 shadow-2xl shadow-black/40 backdrop-blur">
                {(
                  [
                    ['局部重绘', 'repaint_local'],
                    ['消除笔', 'erase'],
                    ['文字重绘', 'repaint_text'],
                    ['画面微调', 'tweak'],
                    ['生成视频', 'generate_video'],
                  ] as const
                ).map(([label, action]) => (
                  <button
                    key={action}
                    type="button"
                    onClick={() => {
                      setMoreOpen(false)
                      if (action === 'erase') {
                        runImageNodeAction({ nodeId: id, action })
                        return
                      }
                      setComposer({ action, label, prompt: '', open: true })
                    }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-100 hover:bg-slate-800/40"
                  >
                    <span className="text-slate-300">•</span>
                    <span>{label}</span>
                  </button>
                ))}

                <div className="h-px bg-slate-800" />

                <button
                  type="button"
                  onClick={() => {
                    setMoreOpen(false)
                    toggleFavorite(activeUrl)
                    appendChatMessage({
                      role: 'system',
                      kind: 'text',
                      text: isFavorite(activeUrl) ? '已从收藏夹移除。' : '已加入收藏夹。',
                    })
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-100 hover:bg-slate-800/40"
                >
                  <span className="text-slate-300">•</span>
                  <span>{isFavorite(activeUrl) ? '取消收藏' : '加入收藏夹'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMoreOpen(false)
                    removeActiveImage()
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-rose-200 hover:bg-rose-500/10"
                >
                  <span className="text-rose-200/80">•</span>
                  <span>删除当前图片</span>
                </button>
              </div>
            ) : null}
          </div>

          {composer?.open ? (
            <div className="mt-2 w-[360px] rounded-2xl border border-slate-800 bg-slate-950/90 p-3 shadow-xl backdrop-blur">
              <div className="flex items-center justify-between">
                <div className="text-xs font-semibold text-slate-200">
                  {composer.label}（模拟）
                </div>
                <button
                  type="button"
                  onClick={() => setComposer(null)}
                  className="rounded-lg px-2 py-1 text-[11px] text-slate-300 hover:bg-slate-800/40"
                >
                  关闭
                </button>
              </div>
              <textarea
                value={composer.prompt}
                onChange={(e) =>
                  setComposer((c) => (c ? { ...c, prompt: e.target.value } : c))
                }
                placeholder="输入描述（可选）"
                className="nodrag nowheel mt-2 h-20 w-full resize-none rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 outline-none focus:border-slate-700"
              />
              <div className="mt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setComposer(null)}
                  className="rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-1.5 text-xs font-semibold text-slate-100 hover:border-slate-700"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const action = composer.action
                    const prompt = composer.prompt.trim() || undefined
                    runImageNodeAction({ nodeId: id, action, prompt })
                    setComposer(null)
                  }}
                  className="rounded-xl border border-amber-300/30 bg-amber-300/10 px-3 py-1.5 text-xs font-semibold text-amber-100 hover:border-amber-300/50"
                >
                  开始
                </button>
              </div>

              <div className="mt-2 grid grid-cols-2 gap-2">
                {(
                  [
                    ['局部重绘', 'repaint_local'],
                    ['文字重绘', 'repaint_text'],
                    ['画面微调', 'tweak'],
                    ['生成视频', 'generate_video'],
                  ] as const
                ).map(([label, action]) => (
                  <button
                    key={action}
                    type="button"
                    onClick={() =>
                      setComposer((c) =>
                        c ? { ...c, label, action, open: true } : c,
                      )
                    }
                    className="rounded-xl border border-slate-800 bg-slate-950/50 px-3 py-2 text-left text-xs font-semibold text-slate-100 hover:border-slate-700"
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      <Handle
        type="source"
        position={Position.Right}
        className="!h-3.5 !w-3.5 !border-2 !border-sky-300/80 !bg-slate-950 !shadow"
        style={{ right: -7, zIndex: 30 }}
      />

    </div>
  )
}

