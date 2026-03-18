import { useCallback } from 'react'
import { useReactFlow } from '@xyflow/react'
import type { CanvasNode } from '../store/canvasStore'

type ControlButtonProps = {
  label: string
  onClick: () => void
}

function ControlButton(props: ControlButtonProps) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      className={[
        'grid h-9 w-9 place-items-center rounded-lg',
        'border border-slate-800 bg-slate-950/70 text-slate-100',
        'hover:border-slate-700 hover:bg-slate-900/70 active:bg-slate-900/90',
        'backdrop-blur',
      ].join(' ')}
      aria-label={props.label}
      title={props.label}
    >
      <span className="text-sm font-semibold leading-none">{props.label}</span>
    </button>
  )
}

export function FlowControls() {
  const rf = useReactFlow<CanvasNode>()

  const zoomIn = useCallback(() => rf.zoomIn({ duration: 160 }), [rf])
  const zoomOut = useCallback(() => rf.zoomOut({ duration: 160 }), [rf])
  const fitView = useCallback(
    () => rf.fitView({ padding: 0.2, duration: 220, maxZoom: 1.2 }),
    [rf],
  )

  return (
    <div className="absolute bottom-4 left-4 z-10">
      <div className="flex flex-col gap-2">
        <ControlButton label="+" onClick={zoomIn} />
        <ControlButton label="-" onClick={zoomOut} />
        <ControlButton label="⤢" onClick={fitView} />
      </div>
    </div>
  )
}

