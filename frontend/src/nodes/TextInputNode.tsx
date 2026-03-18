import { Handle, Position, type NodeProps } from '@xyflow/react'
import { useCallback } from 'react'
import { useCanvasStore, type TextInputData, type TextInputNodeType } from '../store/canvasStore'

function StatusPill({ status }: { status: TextInputData['status'] }) {
  const cls =
    status === 'idle'
      ? 'bg-slate-700/60 text-slate-200'
      : status === 'running'
        ? 'bg-blue-500/20 text-blue-200'
        : status === 'success'
          ? 'bg-emerald-500/20 text-emerald-200'
          : 'bg-rose-500/20 text-rose-200'

  const label =
    status === 'idle'
      ? 'idle'
      : status === 'running'
        ? 'running'
        : status === 'success'
          ? 'success'
          : 'error'

  return (
    <span className={`rounded px-2 py-0.5 text-[11px] font-medium ${cls}`}>
      {label}
    </span>
  )
}

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
      <div className="flex items-center justify-between border-b border-slate-800 px-3 py-2">
        <div className="text-sm font-semibold text-slate-100">{data.title}</div>
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

      <Handle type="source" position={Position.Right} />
    </div>
  )
}

