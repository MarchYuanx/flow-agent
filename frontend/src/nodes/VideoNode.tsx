import { Handle, Position, type NodeProps } from '@xyflow/react'
import { useCallback, useMemo } from 'react'
import { StatusPill } from '../components/StatusPill'
import { useCanvasStore, type VideoData, type VideoNodeType } from '../store/canvasStore'

export function VideoNode(props: NodeProps<VideoNodeType>) {
  const { id, data, selected } = props
  const updateNodeData = useCanvasStore((s) => s.updateNodeData)

  const activeUrl = useMemo(() => {
    const idx = Math.max(0, Math.min(data.activeIndex, Math.max(0, data.videos.length - 1)))
    return data.videos[idx] ?? ''
  }, [data.activeIndex, data.videos])

  const setActive = useCallback(
    (idx: number) => {
      updateNodeData(id, (prev) => {
        const typed = prev as VideoData
        const next = Math.max(0, Math.min(idx, Math.max(0, typed.videos.length - 1)))
        return { ...typed, activeIndex: next }
      })
    },
    [id, updateNodeData],
  )

  return (
    <div
      className={[
        'w-[360px] rounded-xl border bg-slate-900/70 shadow-sm backdrop-blur',
        selected ? 'border-cyan-300/60' : 'border-slate-700/80',
      ].join(' ')}
    >
      <div className="flex items-center justify-between border-b border-slate-800 bg-gradient-to-r from-cyan-500/10 to-transparent px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-cyan-400/20 bg-cyan-500/10">
            <svg viewBox="0 0 24 24" className="h-4 w-4 text-cyan-200" aria-hidden="true">
              <path
                fill="currentColor"
                d="M5 5h10a2 2 0 0 1 2 2v2.5l2.6-1.6A1 1 0 0 1 23 8.8v6.4a1 1 0 0 1-1.4.9L17 14.5V17a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z"
              />
            </svg>
          </span>
          <div className="min-w-0">
            <div className="truncate text-[13px] font-semibold text-slate-100">{data.title}</div>
            <div className="truncate text-[11px] text-slate-400">
              视频节点 · {data.videos.length} 个
            </div>
          </div>
        </div>
        <StatusPill status={data.status} />
      </div>

      <div className="space-y-3 px-3 py-3">
        <div>
          <div className="text-xs font-medium text-slate-300">预览</div>
          {activeUrl.trim().length > 0 ? (
            <div className="mt-2 overflow-hidden rounded-lg border border-slate-800 bg-black/20">
              <video
                src={activeUrl}
                controls
                className="h-44 w-full bg-black object-contain"
              />
              <div className="border-t border-slate-800 bg-slate-950/40 px-2 py-1 text-[11px] text-slate-400">
                {activeUrl}
              </div>
            </div>
          ) : (
            <div className="mt-2 rounded-lg border border-dashed border-slate-800 bg-slate-950/30 px-3 py-6 text-center text-xs text-slate-400">
              视频生成完成后会在这里展示预览
            </div>
          )}
        </div>

        {data.videos.length > 1 ? (
          <div className="nodrag flex flex-wrap gap-2">
            {data.videos.map((u, idx) => (
              <button
                key={`${u}-${idx}`}
                type="button"
                onPointerDown={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
                onClick={() => setActive(idx)}
                className={[
                  'rounded-lg border px-2 py-1 text-[11px] font-semibold',
                  idx === data.activeIndex
                    ? 'border-cyan-300/60 bg-cyan-500/10 text-cyan-100'
                    : 'border-slate-800 bg-slate-950/40 text-slate-200 hover:border-slate-700',
                ].join(' ')}
                title={`第 ${idx + 1} 个视频`}
              >
                #{idx + 1}
              </button>
            ))}
          </div>
        ) : null}

        {data.errorMessage ? <div className="text-xs text-rose-300">{data.errorMessage}</div> : null}
      </div>

      <Handle
        type="target"
        position={Position.Left}
        className="!h-3.5 !w-3.5 !border-2 !border-cyan-300/80 !bg-slate-950 !shadow"
        style={{ left: -7, zIndex: 30 }}
      />
    </div>
  )
}

