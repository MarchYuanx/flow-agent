import { Handle, Position, type NodeProps } from '@xyflow/react'
import { useCallback } from 'react'
import {
  useCanvasStore,
  type LlmGenerateData,
  type LlmGenerateNodeType,
} from '../store/canvasStore'
import { StatusPill } from '../components/StatusPill'

export function LlmGenerateNode(props: NodeProps<LlmGenerateNodeType>) {
  const { id, data, selected } = props
  const updateNodeData = useCanvasStore((s) => s.updateNodeData)
  const runNode = useCanvasStore((s) => s.runNode)

  const onChangePrompt = useCallback(
    (value: string) => {
      updateNodeData(id, (prev) => {
        const typed = prev as LlmGenerateData
        return {
          ...typed,
          prompt: value,
          errorMessage: undefined,
        }
      })
    },
    [id, updateNodeData],
  )

  return (
    <div
      className={[
        'w-[340px] rounded-xl border bg-slate-900/70 shadow-sm backdrop-blur',
        selected ? 'border-fuchsia-400/60' : 'border-slate-700/80',
      ].join(' ')}
    >
      <div className="flex items-center justify-between border-b border-slate-800 bg-gradient-to-r from-fuchsia-500/10 to-transparent px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-fuchsia-400/20 bg-fuchsia-500/10">
            <svg viewBox="0 0 24 24" className="h-4 w-4 text-fuchsia-200" aria-hidden="true">
              <path
                fill="currentColor"
                d="M12 3a7 7 0 0 1 7 7c0 2.3-1.1 4.4-2.8 5.7V19a2 2 0 0 1-2 2H9.8a2 2 0 0 1-2-2v-3.3A7 7 0 0 1 12 3Zm2.2 13.8c1.7-1 2.8-2.8 2.8-4.8a5 5 0 0 0-10 0c0 2 1.1 3.8 2.8 4.8l.4.2V19h4v-2.8l.4-.4Z"
              />
            </svg>
          </span>
          <div className="min-w-0">
            <div className="truncate text-[13px] font-semibold text-slate-100">{data.title}</div>
            <div className="truncate text-[11px] text-slate-400">LLM 生成 · 输出图片 URL</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={() => runNode(id)}
            className="nodrag rounded-lg border border-fuchsia-300/20 bg-fuchsia-500/10 px-2 py-1 text-[11px] font-semibold text-fuchsia-100 hover:border-fuchsia-300/35"
            title="只运行当前节点任务"
          >
            Run
          </button>
          <StatusPill status={data.status} />
        </div>
      </div>

      <div className="space-y-3 px-3 py-3">
        <div>
          <label className="text-xs font-medium text-slate-300">
            Prompt（可手填；后续可由上游 text_input 提供）
          </label>
          <textarea
            value={data.prompt}
            onChange={(e) => onChangePrompt(e.target.value)}
            onPointerDown={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            placeholder="例如：生成一张抽象风格的海报"
            className="nodrag nowheel mt-2 h-20 w-full resize-none rounded-lg border border-slate-700/80 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 outline-none focus:border-fuchsia-400/60"
          />
        </div>

        <div>
          <div className="text-xs font-medium text-slate-300">图片结果</div>
          {data.resultImageUrl ? (
            <div className="mt-2 overflow-hidden rounded-lg border border-slate-800">
              <img
                src={data.resultImageUrl}
                alt="result"
                className="h-44 w-full object-cover"
              />
              <div className="border-t border-slate-800 bg-slate-950/40 px-2 py-1 text-[11px] text-slate-400">
                {data.resultImageUrl}
              </div>
            </div>
          ) : (
            <div className="mt-2 rounded-lg border border-dashed border-slate-800 bg-slate-950/30 px-3 py-6 text-center text-xs text-slate-400">
              运行后会在这里展示“带水印的图片 URL”
            </div>
          )}
        </div>

        {data.errorMessage ? (
          <div className="text-xs text-rose-300">{data.errorMessage}</div>
        ) : null}
      </div>

      <Handle
        type="target"
        position={Position.Left}
        className="!h-3.5 !w-3.5 !border-2 !border-fuchsia-300/80 !bg-slate-950 !shadow"
        style={{ left: -7, zIndex: 30 }}
      />
    </div>
  )
}

