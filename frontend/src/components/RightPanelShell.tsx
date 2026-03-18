import { ChatPanel } from './ChatPanel'

export function RightPanelShell(props: { collapsed: boolean; onToggle: () => void }) {
  const { collapsed, onToggle } = props

  if (collapsed) {
    return (
      <aside className="w-14 shrink-0 border-l border-slate-800 bg-slate-950/60 p-2">
        <button
          type="button"
          onClick={onToggle}
          className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-800 bg-slate-950/60 text-slate-100 hover:border-slate-700"
          title="展开对话"
          aria-label="展开对话"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5 text-slate-200" aria-hidden="true">
            <path
              fill="currentColor"
              d="M20 4H7a3 3 0 0 0-3 3v11.5a1 1 0 0 0 1.4.9L10 17h10a3 3 0 0 0 3-3V7a3 3 0 0 0-3-3Zm-9.8 11L6 16.9V7a1 1 0 0 1 1-1h13a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H10.2Z"
            />
          </svg>
        </button>
      </aside>
    )
  }

  return (
    <div className="relative h-full">
      <div className="absolute left-[-18px] top-3 z-10">
        <button
          type="button"
          onClick={onToggle}
          className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-800 bg-slate-950/80 text-slate-100 shadow-lg shadow-black/30 backdrop-blur hover:border-slate-700"
          title="折叠对话"
          aria-label="折叠对话"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5 text-slate-200" aria-hidden="true">
            <path fill="currentColor" d="M15 6 9 12l6 6-1.4 1.4L6.2 12l7.4-7.4L15 6Z" />
          </svg>
        </button>
      </div>
      <ChatPanel />
    </div>
  )
}

