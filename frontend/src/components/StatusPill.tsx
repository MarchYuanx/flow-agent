import type { RunStatus } from '../store/canvasStore'

const STATUS_STYLE: Record<RunStatus, { cls: string; label: string }> = {
  idle: { cls: 'bg-slate-700/60 text-slate-200', label: 'idle' },
  running: { cls: 'bg-blue-500/20 text-blue-200', label: 'running' },
  success: { cls: 'bg-emerald-500/20 text-emerald-200', label: 'success' },
  error: { cls: 'bg-rose-500/20 text-rose-200', label: 'error' },
}

export function StatusPill(props: { status: RunStatus }) {
  const { status } = props
  const { cls, label } = STATUS_STYLE[status]
  return <span className={`rounded px-2 py-0.5 text-[11px] font-medium ${cls}`}>{label}</span>
}

