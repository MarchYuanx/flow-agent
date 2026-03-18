import { useCallback, useEffect, useRef, useState } from 'react'
import { useCanvasStore, type ChatMessage } from '../store/canvasStore'

function formatTime(ts: number): string {
  const d = new Date(ts)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function MessageItem({ msg }: { msg: ChatMessage }) {
  const isUser = msg.role === 'user'
  return (
    <div
      className={[
        'rounded-2xl border p-3',
        isUser ? 'border-slate-800 bg-slate-950/55' : 'border-slate-800 bg-slate-950/35',
      ].join(' ')}
    >
      <div className="flex items-center justify-between text-[11px] text-slate-500">
        <span className="font-semibold">{isUser ? 'you' : msg.role}</span>
        <span className="tabular-nums">{formatTime(msg.createdAt)}</span>
      </div>
      {msg.kind === 'text' ? (
        <div className="mt-2 whitespace-pre-wrap break-all text-sm text-slate-100 [overflow-wrap:anywhere]">
          {msg.text ?? ''}
        </div>
      ) : (
        <div className="mt-2 space-y-2">
          <div className="overflow-hidden rounded-lg border border-slate-800 bg-black/20">
            <img src={msg.imageUrl ?? ''} alt="chat-image" className="h-40 w-full object-cover" />
          </div>
          <div className="break-all text-[11px] text-slate-400">{msg.imageUrl}</div>
        </div>
      )}
    </div>
  )
}

export function ChatPanel() {
  const selectedNodeId = useCanvasStore((s) => s.selectedNodeId)
  const chatMessages = useCanvasStore((s) => s.chatMessages)
  const appendChatMessage = useCanvasStore((s) => s.appendChatMessage)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const [draft, setDraft] = useState('')
  const prevCountRef = useRef(0)

  const onSend = useCallback(() => {
    const text = draft.trim()
    if (!text) return
    appendChatMessage({ role: 'user', kind: 'text', text })
    setDraft('')
  }, [appendChatMessage, draft])

  useEffect(() => {
    const prev = prevCountRef.current
    const next = chatMessages.length
    prevCountRef.current = next
    if (next <= prev) return
    const el = scrollRef.current
    if (!el) return
    // 等待本次渲染完成后滚动到底部
    const raf = window.requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight
    })
    return () => window.cancelAnimationFrame(raf)
  }, [chatMessages.length])

  return (
    <aside className="flex h-full w-[380px] shrink-0 flex-col border-l border-slate-800 bg-gradient-to-b from-slate-950/70 to-slate-950/50">
      <div className="border-b border-slate-800/80 px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm font-semibold text-slate-200">AI 对话</div>
          <div className="rounded-full border border-slate-800 bg-slate-950/60 px-2.5 py-1 text-[11px] text-slate-400">
            {selectedNodeId ? '已连接画布' : '未选中节点'}
          </div>
        </div>
        <div className="mt-1 text-xs text-slate-400">
          点击画布中的图片可加入会话。
        </div>
      </div>

      {/* 中间区域必须可收缩，否则消息多时会把容器撑高 */}
      <div className="flex min-h-0 flex-1 flex-col p-4">
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex items-center justify-between">
            <div className="text-xs font-semibold text-slate-300">会话</div>
            <div className="text-[11px] text-slate-500">{chatMessages.length} 条</div>
          </div>
          <div className="relative mt-2 flex h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/35">
            <div
              ref={scrollRef}
              className={[
                'h-0 flex-1 touch-pan-y overscroll-contain space-y-2 overflow-auto p-3 pr-2',
                // 滚动条（WebKit）
                '[&::-webkit-scrollbar]:w-1.5',
                '[&::-webkit-scrollbar-track]:bg-transparent',
                '[&::-webkit-scrollbar-thumb]:rounded-full',
                '[&::-webkit-scrollbar-thumb]:bg-slate-700/60',
                'hover:[&::-webkit-scrollbar-thumb]:bg-slate-600/70',
              ].join(' ')}
            >
              {chatMessages.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-800 bg-slate-950/30 px-3 py-8 text-center text-xs text-slate-400">
                  暂无消息（点击图片上的“加入会话”可生成一条图片消息）
                </div>
              ) : (
                chatMessages.map((m) => <MessageItem key={m.id} msg={m} />)
              )}
            </div>

            <div className="pointer-events-none absolute inset-x-0 top-0 h-6 bg-gradient-to-b from-slate-950/60 to-transparent" />
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-slate-950/70 to-transparent" />
          </div>
        </div>
      </div>

      <div className="border-t border-slate-800/80 bg-slate-950/55 p-3">
        <div className="flex items-end gap-2">
          <div className="flex flex-1 items-end gap-2 rounded-2xl border border-slate-800 bg-slate-950/60 px-2 py-2 shadow-lg shadow-black/20 backdrop-blur">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  onSend()
                }
              }}
              placeholder="输入消息… 回车发送"
              className={[
                'nodrag nowheel min-h-10 max-h-28 flex-1 resize-none bg-transparent px-2 py-1.5 text-sm text-slate-100 outline-none',
                'placeholder:text-slate-500',
                '[&::-webkit-scrollbar]:w-1.5',
                '[&::-webkit-scrollbar-track]:bg-transparent',
                '[&::-webkit-scrollbar-thumb]:rounded-full',
                '[&::-webkit-scrollbar-thumb]:bg-slate-700/60',
                'hover:[&::-webkit-scrollbar-thumb]:bg-slate-600/70',
              ].join(' ')}
            />
            <button
              type="button"
              onClick={onSend}
              disabled={draft.trim().length === 0}
              className={[
                'inline-flex h-10 w-10 items-center justify-center rounded-xl border text-slate-100',
                'border-slate-800 bg-slate-950/60 hover:border-slate-700',
                'disabled:cursor-not-allowed disabled:opacity-50',
              ].join(' ')}
              title="发送"
              aria-label="发送"
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5 text-slate-200" aria-hidden="true">
                <path
                  fill="currentColor"
                  d="M3 11.2V4.5a1 1 0 0 1 1.4-.9l17 7.5a1 1 0 0 1 0 1.8l-17 7.5A1 1 0 0 1 3 19.5v-6.7l10-1.3-10-1.3Z"
                />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </aside>
  )
}

