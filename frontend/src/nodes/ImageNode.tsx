import { Handle, Position, type NodeProps } from '@xyflow/react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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

  // repaint_local：mask 画布（涂抹遮罩）
  //
  // 局部重绘（mask 涂抹）实现原理（当前为前端输入+参数透传的 mock 实现）：
  // 1) 用户在“预览图区域”上涂抹（白色笔迹表示需要重绘/保留的区域，约定由后端解释）
  // 2) 画布坐标映射：把用户指针的 clientX/clientY 映射到 256x256 的 mask canvas 坐标系
  //    - 这样做的好处是：mask 大小固定，便于后续编码与参数传输
  // 3) 提交时生成输入 token：
  //    - 先把 canvas.toDataURL('image/png') 得到 mask 数据
  //    - 再做一个轻量 hash，把超长 base64 压缩成短 token（避免把大字符串塞进节点数据，影响保存/传输）
  // 4) 通过 `runImageNodeAction({ action: 'repaint_local', mask })` 把 token 透传给后端
  // 5) 后端在任务执行阶段（ai-task.service）基于 mask token 的摘要生成不同的 mock resultUrl
  //
  // 注意：
  // - 这里没有真正做像素级“把 mask 应用到图片”的图像处理（后端 mock 的职责是验证业务链路）
  // - 真正生产实现时：后端会把 mask token 解码为 mask 图，并进行重绘/抠图等融合运算
  const maskCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const maskDrawingRef = useRef(false)
  const maskLastPointRef = useRef<{ x: number; y: number } | null>(null)
  const MASK_SIZE = 256
  const MASK_BRUSH_RADIUS = 12

  const clearMask = useCallback(() => {
    const canvas = maskCanvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
  }, [])

  const getMaskDataUrl = useCallback((): string | undefined => {
    const canvas = maskCanvasRef.current
    if (!canvas) return undefined
    try {
      return canvas.toDataURL('image/png')
    } catch {
      return undefined
    }
  }, [])

  const hashMaskInput = useCallback((input: string): string => {
    // 轻量 hash：
    // - 用于“区分不同遮罩”，避免把超长 base64 存入节点数据（会显著影响 local 保存和网络传输）
    // - 这里只用于 demo/mock 的“可追踪性”；不是安全哈希，不用于加密/鉴权场景
    let h1 = 0xdeadbeef ^ input.length
    let h2 = 0x41c6ce57 ^ input.length
    for (let i = 0; i < input.length; i++) {
      const ch = input.charCodeAt(i)
      h1 = Math.imul(h1 ^ ch, 2654435761)
      h2 = Math.imul(h2 ^ ch, 1597334677)
    }
    h1 = (h1 ^ (h1 >>> 16)) >>> 0
    h2 = (h2 ^ (h2 >>> 16)) >>> 0
    const hex = (h2 >>> 0).toString(16).padStart(8, '0') + (h1 >>> 0).toString(16).padStart(8, '0')
    return hex.slice(0, 12)
  }, [])

  useEffect(() => {
    if (composer?.open && composer.action === 'repaint_local') {
      clearMask()
    }
  }, [composer?.action, composer?.open, clearMask])

  const activeUrl = useMemo(() => {
    const idx = Math.max(0, Math.min(data.activeIndex, data.images.length - 1))
    return data.images[idx] ?? ''
  }, [data.activeIndex, data.images])

  const task = data.aiTask
  const taskRunning = task?.status === 'running'

  const displayedImages = useMemo(() => data.images.slice(0, 8), [data.images])
  const selectedSet = useMemo(() => new Set<number>(data.selectedIndexes ?? []), [data.selectedIndexes])
  const displayedIndexes = useMemo(() => displayedImages.map((_, i) => i), [displayedImages])
  const displayedSelectedCount = useMemo(
    () => displayedIndexes.filter((idx) => selectedSet.has(idx)).length,
    [displayedIndexes, selectedSet],
  )
  const allDisplayedSelected = displayedImages.length > 0 && displayedSelectedCount === displayedImages.length

  const removeActiveImage = useCallback(() => {
    updateNodeData(id, (prev) => {
      const typed = prev as ImageData
      const idx = Math.max(0, Math.min(typed.activeIndex, typed.images.length - 1))
      const nextImages = typed.images.slice()
      if (nextImages.length === 0) return typed
      nextImages.splice(idx, 1)
      const nextActive = Math.max(0, Math.min(idx, nextImages.length - 1))
      const nextSelected = (typed.selectedIndexes ?? [])
        .filter((x) => x !== idx)
        .map((x) => (x > idx ? x - 1 : x))
      return {
        ...typed,
        images: nextImages,
        activeIndex: nextImages.length === 0 ? 0 : nextActive,
        selectedIndexes: nextSelected,
        errorMessage: undefined,
      }
    })
  }, [id, updateNodeData])

  const removeImageAt = useCallback(
    (idx: number) => {
      updateNodeData(id, (prev) => {
        const typed = prev as ImageData
        const clamped = Math.max(0, Math.min(idx, Math.max(0, typed.images.length - 1)))
        const nextImages = typed.images.slice()
        if (nextImages.length === 0) return typed
        nextImages.splice(clamped, 1)
        const nextActive = Math.max(0, Math.min(typed.activeIndex, Math.max(0, nextImages.length - 1)))
        const nextSelected = (typed.selectedIndexes ?? [])
          .filter((x) => x !== clamped)
          .map((x) => (x > clamped ? x - 1 : x))
        return {
          ...typed,
          images: nextImages,
          activeIndex: nextImages.length === 0 ? 0 : nextActive,
          selectedIndexes: nextSelected,
          errorMessage: undefined,
        }
      })
    },
    [id, updateNodeData],
  )

  const toggleSelected = useCallback(
    (idx: number) => {
      updateNodeData(id, (prev) => {
        const typed = prev as ImageData
        const set = new Set<number>(typed.selectedIndexes ?? [])
        if (set.has(idx)) set.delete(idx)
        else set.add(idx)
        return { ...typed, selectedIndexes: Array.from(set).sort((a, b) => a - b) }
      })
    },
    [id, updateNodeData],
  )

  const toggleSelectAllDisplayed = useCallback(
    (checked: boolean) => {
      updateNodeData(id, (prev) => {
        const typed = prev as ImageData
        const set = new Set<number>(typed.selectedIndexes ?? [])
        const max = Math.min(8, typed.images.length)
        if (checked) {
          for (let i = 0; i < max; i++) set.add(i)
        } else {
          for (let i = 0; i < max; i++) set.delete(i)
        }
        return { ...typed, selectedIndexes: Array.from(set).sort((a, b) => a - b) }
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
        const nextSelected =
          (typed.selectedIndexes ?? []).length === 0
            ? Array.from({ length: Math.min(8, nextImages.length) }, (_, i) => i)
            : Array.from(new Set([...(typed.selectedIndexes ?? []), ...urls.map((_, i) => typed.images.length + i)])).sort(
                (a, b) => a - b,
              )
        return {
          ...typed,
          images: nextImages,
          activeIndex: Math.max(0, nextImages.length - urls.length),
          selectedIndexes: nextSelected,
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
      const nextSelected =
        (typed.selectedIndexes ?? []).length === 0
          ? Array.from({ length: Math.min(8, nextImages.length) }, (_, i) => i)
          : Array.from(new Set([...(typed.selectedIndexes ?? []), nextImages.length - 1])).sort((a, b) => a - b)
      return {
        ...typed,
        images: nextImages,
        activeIndex: Math.max(0, nextImages.length - 1),
        selectedIndexes: nextSelected,
        errorMessage: undefined,
      }
    })
  }, [id, updateNodeData])

  return (
    <div
      className={[
        'relative w-[480px] rounded-xl border bg-slate-900/70 shadow-sm backdrop-blur',
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

          <div className="nodrag mt-3 rounded-2xl border border-slate-800 bg-slate-950/35 p-2">
            <div className="flex items-center justify-between px-1 pb-2">
              <label className="flex items-center gap-2 text-[11px] font-semibold text-slate-200">
                <input
                  type="checkbox"
                  checked={allDisplayedSelected}
                  onChange={(e) => toggleSelectAllDisplayed(e.target.checked)}
                  onPointerDown={(e) => e.stopPropagation()}
                  onMouseDown={(e) => e.stopPropagation()}
                  className="h-4 w-4 accent-amber-300"
                />
                全选（前 {Math.min(8, data.images.length)} 张）
              </label>
              <div className="text-[11px] text-slate-400">
                已选 {displayedSelectedCount}/{Math.min(8, data.images.length)}
                {data.images.length > 8 ? ` · 共 ${data.images.length} 张（仅展示前 8 张）` : ''}
              </div>
            </div>

            {displayedImages.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-800 bg-slate-950/30 px-3 py-6 text-center text-xs text-slate-400">
                暂无图片。可上传或模拟上传后再执行操作。
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {displayedImages.map((u, idx) => {
                  const checked = selectedSet.has(idx)
                  const favored = isFavorite(u)
                  return (
                    <div
                      key={`${u}-${idx}`}
                      className={[
                        'relative overflow-hidden rounded-xl border bg-black/20',
                        idx === data.activeIndex ? 'border-amber-300/60' : 'border-slate-800',
                      ].join(' ')}
                      onPointerDown={(e) => e.stopPropagation()}
                      onMouseDown={(e) => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          updateNodeData(id, (prev) => ({ ...(prev as ImageData), activeIndex: idx }))
                        }}
                        className="block w-full"
                        title="点击设为预览图"
                      >
                        <img src={u} alt={`img-${idx}`} className="h-40 w-full object-cover" />
                      </button>

                      <label className="absolute left-2 top-2 inline-flex items-center gap-2 rounded-lg border border-slate-800/80 bg-slate-950/80 px-2 py-1 text-[11px] font-semibold text-slate-100 backdrop-blur">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleSelected(idx)}
                          onClick={(e) => e.stopPropagation()}
                          className="h-4 w-4 accent-amber-300"
                        />
                        #{idx + 1}
                      </label>

                      <div className="absolute right-2 top-2 flex items-center gap-1">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            toggleFavorite(u)
                          }}
                          className={[
                            'inline-flex h-8 w-8 items-center justify-center rounded-xl border',
                            'border-slate-800/80 bg-slate-950/70 hover:border-slate-700',
                            favored ? 'text-amber-200' : 'text-slate-200',
                          ].join(' ')}
                          title={favored ? '取消收藏' : '加入收藏'}
                          aria-label={favored ? '取消收藏' : '加入收藏'}
                        >
                          <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
                            <path
                              fill="currentColor"
                              d="M12 17.3 6.8 20a1 1 0 0 1-1.5-1.1l1-5.7-4.2-4A1 1 0 0 1 2.7 7l5.8-.8 2.6-5.2a1 1 0 0 1 1.8 0l2.6 5.2 5.8.8a1 1 0 0 1 .6 1.7l-4.2 4 1 5.7A1 1 0 0 1 17.2 20L12 17.3Z"
                            />
                          </svg>
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            openPreview({ title: data.title, imageUrl: u })
                          }}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-slate-800/80 bg-slate-950/70 text-slate-100 hover:border-slate-700"
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
                          onClick={(e) => {
                            e.stopPropagation()
                            removeImageAt(idx)
                          }}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-rose-500/30 bg-rose-500/10 text-rose-200 hover:border-rose-500/50"
                          title="删除该图片"
                          aria-label="删除该图片"
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
                  )
                })}
              </div>
            )}
          </div>

        </div>

        {taskRunning ? (
          <div className="rounded-2xl bg-slate-950/35 px-3 py-3">
            <div className="flex items-center justify-between text-[11px] text-slate-300">
              <span>任务进行中</span>
              <span className="tabular-nums">{Math.min(99, task?.progress ?? 1)}%</span>
            </div>
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
              <div
                className="h-full rounded-full bg-amber-300/70"
                style={{ width: `${Math.min(99, task?.progress ?? 1)}%` }}
              />
            </div>
          </div>
        ) : null}

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
                      mask: data.sourceAction === 'repaint_local' ? data.sourceMask : undefined,
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
                    const wasFavorite = isFavorite(activeUrl)
                    toggleFavorite(activeUrl)
                    appendChatMessage({
                      role: 'system',
                      kind: 'text',
                      text: wasFavorite ? '已从收藏夹移除。' : '已加入收藏夹。',
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

              {composer.action === 'repaint_local' ? (
                <div className="mt-3">
                  <div className="text-xs font-medium text-slate-300">
                    mask 涂抹遮罩（局部重绘输入，当前为 mock）
                  </div>
                  <div className="relative mt-2 h-[256px] w-full overflow-hidden rounded-xl border border-slate-800 bg-black/20">
                    <img
                      src={activeUrl}
                      alt="mask-source"
                      className="h-full w-full object-cover"
                      draggable={false}
                    />
                    <canvas
                      ref={maskCanvasRef}
                      width={MASK_SIZE}
                      height={MASK_SIZE}
                      className="absolute inset-0 h-full w-full cursor-crosshair touch-none"
                      onPointerDown={(e) => {
                        e.stopPropagation()
                        e.preventDefault()
                        const canvas = maskCanvasRef.current
                        if (!canvas) return
                        canvas.setPointerCapture(e.pointerId)
                        maskDrawingRef.current = true
                        maskLastPointRef.current = null

                        const rect = canvas.getBoundingClientRect()
                        const x = ((e.clientX - rect.left) * canvas.width) / rect.width
                        const y = ((e.clientY - rect.top) * canvas.height) / rect.height
                        maskLastPointRef.current = { x, y }

                        const ctx = canvas.getContext('2d')
                        if (!ctx) return
                        ctx.fillStyle = 'rgba(255,255,255,0.95)'
                        ctx.beginPath()
                        ctx.arc(x, y, MASK_BRUSH_RADIUS, 0, Math.PI * 2)
                        ctx.fill()
                      }}
                      onPointerMove={(e) => {
                        if (!maskDrawingRef.current) return
                        e.stopPropagation()
                        e.preventDefault()
                        const canvas = maskCanvasRef.current
                        if (!canvas) return
                        const rect = canvas.getBoundingClientRect()
                        const x = ((e.clientX - rect.left) * canvas.width) / rect.width
                        const y = ((e.clientY - rect.top) * canvas.height) / rect.height

                        const last = maskLastPointRef.current
                        const ctx = canvas.getContext('2d')
                        if (!ctx) return

                        ctx.strokeStyle = 'rgba(255,255,255,0.95)'
                        ctx.lineWidth = MASK_BRUSH_RADIUS * 2
                        ctx.lineCap = 'round'
                        ctx.lineJoin = 'round'

                        if (last) {
                          ctx.beginPath()
                          ctx.moveTo(last.x, last.y)
                          ctx.lineTo(x, y)
                          ctx.stroke()
                        } else {
                          ctx.beginPath()
                          ctx.arc(x, y, MASK_BRUSH_RADIUS, 0, Math.PI * 2)
                          ctx.fill()
                        }
                        maskLastPointRef.current = { x, y }
                      }}
                      onPointerUp={(e) => {
                        e.stopPropagation()
                        e.preventDefault()
                        maskDrawingRef.current = false
                        maskLastPointRef.current = null
                        const canvas = maskCanvasRef.current
                        try {
                          canvas?.releasePointerCapture(e.pointerId)
                        } catch {
                          // no-op
                        }
                      }}
                      onPointerCancel={(e) => {
                        e.stopPropagation()
                        e.preventDefault()
                        maskDrawingRef.current = false
                        maskLastPointRef.current = null
                      }}
                    />
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onPointerDown={(e) => e.stopPropagation()}
                      onMouseDown={(e) => e.stopPropagation()}
                      onClick={() => clearMask()}
                      className="rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-1.5 text-xs font-semibold text-slate-100 hover:border-slate-700"
                    >
                      清空遮罩
                    </button>
                    <div className="text-[11px] text-slate-400">在图片上涂抹要重绘的区域</div>
                  </div>
                </div>
              ) : null}

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
                    const maskDataUrl = action === 'repaint_local' ? getMaskDataUrl() : undefined
                    const mask = maskDataUrl ? `mask_${hashMaskInput(maskDataUrl)}` : undefined
                    runImageNodeAction({ nodeId: id, action, prompt, mask })
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
        type="target"
        position={Position.Left}
        className="!h-3.5 !w-3.5 !border-2 !border-sky-300/80 !bg-slate-950 !shadow"
        style={{ left: -7, zIndex: 30 }}
      />
      <Handle
        type="source"
        position={Position.Right}
        className="!h-3.5 !w-3.5 !border-2 !border-sky-300/80 !bg-slate-950 !shadow"
        style={{ right: -7, zIndex: 30 }}
      />

    </div>
  )
}

