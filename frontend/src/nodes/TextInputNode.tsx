import { Handle, Position, type NodeProps } from '@xyflow/react'
import { useCallback } from 'react'
import { useCanvasStore, type TextInputData, type TextInputNodeType } from '../store/canvasStore'
import { StatusPill } from '../components/StatusPill'

export function TextInputNode(props: NodeProps<TextInputNodeType>) {
  const { id, data, selected } = props
  const updateNodeData = useCanvasStore((s) => s.updateNodeData)

  const onChange = useCallback(
    (value: string) => {
      updateNodeData(id, (prev) => {
        const typed = prev as TextInputData
        return {
          ...typed,
          text: value,
          errorMessage: undefined,
        }
      })
    },
    [id, updateNodeData],
  )

  return (
    <div
      className={[
        'w-72 rounded-xl border bg-slate-900/70 shadow-sm backdrop-blur',
        selected ? 'border-violet-400/60' : 'border-slate-700/80',
      ].join(' ')}
    >
      <div className="flex items-center justify-between border-b border-slate-800 bg-gradient-to-r from-violet-500/10 to-transparent px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-violet-400/20 bg-violet-500/10">
            <svg viewBox="0 0 24 24" className="h-4 w-4 text-violet-200" aria-hidden="true">
              <path
                fill="currentColor"
                d="M6 4h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Zm2 4h8v2H8V8Zm0 4h8v2H8v-2Zm0 4h5v2H8v-2Z"
              />
            </svg>
          </span>
          <div className="min-w-0">
            <div className="truncate text-[13px] font-semibold text-slate-100">{data.title}</div>
            <div className="truncate text-[11px] text-slate-400">输入文本 · 作为下游 Prompt</div>
          </div>
        </div>
        <StatusPill status={data.status} />
      </div>

      <div className="px-3 py-3">
        <label className="text-xs font-medium text-slate-300">输入文本</label>
        <textarea
          value={data.text}
          onChange={(e) => onChange(e.target.value)}
          onPointerDown={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          placeholder="例如：生成一张带水印的示例图片"
          className="nodrag nowheel mt-2 h-24 w-full resize-none rounded-lg border border-slate-700/80 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 outline-none focus:border-violet-400/60"
        />
        {data.errorMessage ? (
          <div className="mt-2 text-xs text-rose-300">{data.errorMessage}</div>
        ) : null}
      </div>

      <Handle
        type="source"
        position={Position.Right}
        className="!h-3.5 !w-3.5 !border-2 !border-violet-300/80 !bg-slate-950 !shadow"
        style={{ right: -7, zIndex: 30 }}
      />
    </div>
  )
}

