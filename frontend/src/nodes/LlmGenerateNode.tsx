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
      <div className="flex items-center justify-between border-b border-slate-800 px-3 py-2">
        <div className="text-sm font-semibold text-slate-100">{data.title}</div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={() => runNode(id)}
            className="nodrag rounded-lg border border-slate-700/80 bg-slate-950/50 px-2 py-1 text-[11px] font-semibold text-slate-100 hover:border-slate-600"
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

      <Handle type="target" position={Position.Left} />
    </div>
  )
}

