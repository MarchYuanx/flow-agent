import type { AiTaskStatusResponse } from '../hooks/useApi'

/**
 * 统一的 AI 任务轮询器（start 之后 poll）
 *
 * 业务目标：
 * - 后端生成任务接口仅返回 `taskId`
 * - 前端以固定间隔轮询状态，驱动节点 `running/success/error` 与进度回填
 *
 * 策略：
 * - `intervalMs`：默认 1s（轮询频率与开销平衡）
 * - `timeoutMs`：默认 30s（避免永远 pending）
 * - `shouldContinue`：当目标节点被删除时，停止轮询并抛错（让 store 可回填 error）
 */
export type PollAiTaskParams = {
  taskId: string
  intervalMs: number
  timeoutMs: number
  getAiTaskStatus: (taskId: string) => Promise<AiTaskStatusResponse>
  onUpdate?: (status: AiTaskStatusResponse) => void
  shouldContinue?: () => boolean
}

export async function pollAiTask(params: PollAiTaskParams): Promise<AiTaskStatusResponse> {
  const { taskId, intervalMs, timeoutMs, getAiTaskStatus, onUpdate, shouldContinue } = params

  const startAt = Date.now()
  // eslint-disable-next-line no-constant-condition
  while (true) {
    if (shouldContinue && !shouldContinue()) {
      throw new Error('poll cancelled')
    }

    const next = await getAiTaskStatus(taskId)
    onUpdate?.(next)

    if (next.status === 'success') return next
    if (next.status === 'error') throw new Error(next.errorMessage || 'task failed')

    if (Date.now() - startAt >= timeoutMs) {
      throw new Error('task timeout')
    }

    await new Promise<void>((r) => window.setTimeout(r, intervalMs))
  }
}

