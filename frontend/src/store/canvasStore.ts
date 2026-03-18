import {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
} from '@xyflow/react'
import { create } from 'zustand'
import {
  executeDag,
  executeDagToTarget,
  DagCycleError,
  hasDagCycle,
} from '../utils/dagExecutor'
import type {
  AiTaskStartRequest,
  AiTaskStatusResponse,
  CanvasSaveRequest,
  GenerateImageRequest,
  ImageAction,
} from '../hooks/useApi'
import { pollAiTask } from '../utils/pollAiTask'

/**
 * 全局画布状态（Zustand 单一事实源）
 *
 * 设计目标：
 * - **状态收敛**：nodes/edges、执行状态、日志、收藏、会话、预览、UI 折叠等跨区域状态统一在 store，避免 props 链与状态分裂。
 * - **数据流清晰**：UI 只触发 action；复杂编排在 store 内完成；纯算法在 utils（如 DAG 执行器）中完成。
 * - **可观测与可调试**：对 DAG/节点/图片任务统一写 logs；任务状态用 aiTask 统一表达，便于 UI 展示与排障。
 *
 * 关键数据流（高层）：
 * - 画布交互（拖拽/连线/选择） → store 更新 `nodes/edges/selectedNodeId`
 * - DAG 执行：
 *   - UI 触发 `run()` / `runNode(nodeId)`
 *   - store 调用 `executeDag` / `executeDagToTarget`
 *   - store 回填节点 data（status/result/error）并追加 logs
 * - 图片/视频任务（ImageNode 工具栏）：
 *   - UI 触发 `runImageNodeAction({nodeId, action, prompt})`
 *   - store 读取 `ImageData.selectedIndexes` 作为输入图片集合（未选择则直接提示）
 *   - store 调用 `useApi` 注入的函数（applyImageAction / generateVideo）
 *   - store 创建“结果节点”（image-* 或 video-*）并自动连线（image→image / image→video）
 *   - 任务状态统一写入 `aiTask`（含整体/分项进度、错误信息、时间戳）
 */
export type NodeType = 'text_input' | 'llm_generate' | 'image' | 'video'

/** 统一的运行状态（节点/任务共用） */
export type RunStatus = 'idle' | 'running' | 'success' | 'error'

export type ChatRole = 'system' | 'user'
export type ChatMessageKind = 'text' | 'image'

export type ChatMessage = {
  id: string
  role: ChatRole
  kind: ChatMessageKind
  text?: string
  imageUrl?: string
  createdAt: number
}

export type FavoriteItem = {
  id: string
  url: string
  createdAt: number
}

export type CanvasLogLevel = 'info' | 'success' | 'error'
export type CanvasLogStatus = 'start' | 'running' | 'success' | 'error'

export type CanvasLogEntry = {
  id: string
  createdAt: number
  level: CanvasLogLevel
  status: CanvasLogStatus
  scope: 'dag' | 'node' | 'image_action'
  nodeId?: string
  nodeType?: NodeType
  action?: string
  message: string
  result?: unknown
}

export type VideoMessage = ChatMessage & {
  kind: 'text'
  text: string
}

export type NodeMenuState = {
  nodeId: string
  anchor: { x: number; y: number }
} | null

export type TextInputData = {
  title: string
  text: string
  status: RunStatus
  errorMessage?: string
}

export type LlmGenerateData = {
  title: string
  prompt: string
  status: RunStatus
  resultImageUrl?: string
  errorMessage?: string
}

export type ImageAiTaskItem = {
  index: number
  status: RunStatus
  progress: number
  errorMessage?: string
}

export type ImageAiTask = {
  id: string
  action: ImageAction
  prompt?: string
  status: RunStatus
  progress: number
  items?: ImageAiTaskItem[]
  createdAt: number
  updatedAt: number
}

export type ImageData = {
  title: string
  images: string[]
  activeIndex: number
  /**
   * 选择哪些图片参与 AI 操作（索引集合）
   *
   * - UI：图片节点以“最多 8 张网格 + 复选框/全选”维护该集合
   * - store：`runImageNodeAction` 严格以该集合对应的图片 URL 作为输入（未选中则直接提示并返回）
   */
  selectedIndexes?: number[]
  status: RunStatus
  errorMessage?: string
  lastAction?: ImageAction
  /** 用于“再次生成”：记录这张图的来源输入与参数 */
  sourceNodeId?: string
  sourceImages?: string[]
  sourceAction?: ImageAction
  sourcePrompt?: string
  /**
   * 局部重绘（`repaint_local`）使用的涂抹遮罩（mask）。
   *
   * 设计要点：
   * - 前端在 mask canvas 上涂抹后，会生成一个短 token（避免把超长 base64 写入节点数据）
   * - 该 token 随着“源信息”被记录在节点 `data` 上，确保“再次生成”能复用相同遮罩
   * - 当 `runImageNodeAction({ action: 'repaint_local', mask })` 启动后端任务时，store 会把该 token
   *   透传给 `startAiTask(kind=image_action)`，由后端任务决定结果（当前为 mock）
   */
  sourceMask?: string
  progress?: number
  progresses?: number[]
  imageErrors?: Array<string | null>
  /**
   * 统一的 AI 任务状态
   *
   * 用于局部重绘/抠图/超清/文字重绘/微调/生成视频等任务的可观测表达。
   * - `items[idx]`：多图并发的最小粒度（进度/成功/失败原因）
   * - `progress`：整体进度（items 的平均值）
   */
  aiTask?: ImageAiTask
}

export type VideoData = {
  title: string
  videos: string[]
  activeIndex: number
  status: RunStatus
  errorMessage?: string
  /** 任务来源（用于追溯） */
  sourceNodeId?: string
  sourceImages?: string[]
  sourceAction?: ImageAction
  sourcePrompt?: string
  /** 统一的 AI 任务状态（生成视频） */
  aiTask?: ImageAiTask
}

export type CanvasNodeData = TextInputData | LlmGenerateData | ImageData | VideoData
export type CanvasNode = Node<CanvasNodeData, NodeType>
export type TextInputNodeType = Node<TextInputData, 'text_input'>
export type LlmGenerateNodeType = Node<LlmGenerateData, 'llm_generate'>
export type ImageNodeType = Node<ImageData, 'image'>
export type VideoNodeType = Node<VideoData, 'video'>

type CanvasState = {
  nodes: CanvasNode[]
  edges: Edge[]
  isRunning: boolean
  globalError: string | null
  selectedNodeId: string | null
  logs: CanvasLogEntry[]
  favorites: FavoriteItem[]
  favoritesOpen: boolean
  preview: { title: string; imageUrl: string } | null
  leftPanelCollapsed: boolean
  rightPanelCollapsed: boolean
  nodeMenu: NodeMenuState
  chatMessages: ChatMessage[]
  generateImageFn: ((req: GenerateImageRequest) => Promise<string>) | null
  applyImageActionFn: ((req: { imageUrl: string; action: ImageAction; prompt?: string }) => Promise<string>) | null
  generateVideoFn: ((req: { imageUrl: string; prompt?: string }) => Promise<string>) | null
  startAiTaskFn: ((req: AiTaskStartRequest) => Promise<{ taskId: string }>) | null
  getAiTaskStatusFn: ((taskId: string) => Promise<AiTaskStatusResponse>) | null
  saveCanvasFn: ((req: CanvasSaveRequest) => Promise<void>) | null
  setNodes: (nodes: CanvasNode[]) => void
  setEdges: (edges: Edge[]) => void
  onNodesChange: (changes: NodeChange<CanvasNode>[]) => void
  onEdgesChange: (changes: EdgeChange[]) => void
  onConnect: (connection: Connection) => void
  setSelectedNodeId: (nodeId: string | null) => void
  appendLog: (entry: Omit<CanvasLogEntry, 'id' | 'createdAt'>) => void
  clearLogs: () => void
  toggleLeftPanel: () => void
  toggleRightPanel: () => void
  openFavorites: () => void
  closeFavorites: () => void
  addFavorite: (url: string) => void
  toggleFavorite: (url: string) => void
  removeFavoriteByUrl: (url: string) => void
  removeFavorite: (favoriteId: string) => void
  isFavorite: (url: string) => boolean
  openPreview: (params: { title: string; imageUrl: string }) => void
  closePreview: () => void
  openNodeMenu: (nodeId: string, anchor: { x: number; y: number }) => void
  closeNodeMenu: () => void
  appendChatMessage: (message: Omit<ChatMessage, 'id' | 'createdAt'>) => void
  deleteNode: (nodeId: string) => void
  setGenerateImageFn: (fn: ((req: GenerateImageRequest) => Promise<string>) | null) => void
  setApplyImageActionFn: (
    fn: ((req: { imageUrl: string; action: ImageAction; prompt?: string }) => Promise<string>) | null,
  ) => void
  setGenerateVideoFn: (fn: ((req: { imageUrl: string; prompt?: string }) => Promise<string>) | null) => void
  setStartAiTaskFn: (fn: ((req: AiTaskStartRequest) => Promise<{ taskId: string }>) | null) => void
  setGetAiTaskStatusFn: (fn: ((taskId: string) => Promise<AiTaskStatusResponse>) | null) => void
  setSaveCanvasFn: (fn: ((req: CanvasSaveRequest) => Promise<void>) | null) => void

  addNode: (type: NodeType, position: { x: number; y: number }) => void
  updateNodeData: (nodeId: string, updater: (prev: CanvasNodeData) => CanvasNodeData) => void

  run: (generateImage: (req: GenerateImageRequest) => Promise<string>) => Promise<void>
  runNode: (nodeId: string) => Promise<void>
  runImageNodeAction: (
    params: { nodeId: string; action: ImageAction; prompt?: string; mask?: string | undefined },
  ) => Promise<void>
}

let nodeSeq = 1

/**
 * 仅用于前端模拟任务进度（不影响业务逻辑）
 *
 * 背景：图片/视频生成的真实耗时在后端，前端通过“渐进进度 + 完成瞬间跳 100%”改善体感。
 * 注意：必须在节点删除/任务结束时清理定时器，避免泄漏。
 */
const progressTimers = new Map<string, number>()

/**
 * 全画布共享的 AI 并发控制：限制同时“启动运行”任务的数量。
 *
 * 设计原因：
 * - 图片操作 / 视频生成 / llm_generate 都可能触发后端耗时任务
 * - 若不限制，短时间内可能同时启动过多任务导致体验与后端资源压力变差
 */
const MAX_AI_CONCURRENCY = 6
type ReleaseFn = () => void
function createSemaphore(max: number) {
  let current = 0
  const waiters: Array<(release: ReleaseFn) => void> = []

  const dispatch = () => {
    if (current >= max) return
    const next = waiters.shift()
    if (!next) return
    current += 1

    let released = false
    const release: ReleaseFn = () => {
      if (released) return
      released = true
      current -= 1
      dispatch()
    }
    next(release)
  }

  return {
    acquire: async (): Promise<ReleaseFn> =>
      new Promise<ReleaseFn>((resolve) => {
        if (current < max) {
          current += 1
          let released = false
          const release: ReleaseFn = () => {
            if (released) return
            released = true
            current -= 1
            dispatch()
          }
          resolve(release)
          return
        }
        waiters.push(resolve)
      }),
  }
}

const aiConcurrencyLimiter = createSemaphore(MAX_AI_CONCURRENCY)

/** 画布保存防抖（毫秒） */
const CANVAS_SAVE_DEBOUNCE_MS = 500
/** 默认画布 id：后续可改为基于路由/会话的动态值 */
const DEFAULT_CANVAS_ID = 'default'
/** 当前防抖定时器 */
let canvasSaveTimer: number | null = null

function scheduleCanvasSave(storeGet: () => CanvasState, storeSet: (partial: Partial<CanvasState>) => void) {
  if (canvasSaveTimer !== null) window.clearTimeout(canvasSaveTimer)
  canvasSaveTimer = window.setTimeout(() => {
    const saveFn = storeGet().saveCanvasFn
    if (!saveFn) return

    const { nodes, edges } = storeGet()
    void saveFn({ canvasId: DEFAULT_CANVAS_ID, nodes, edges }).catch((e) => {
      const message = e instanceof Error ? e.message : '保存画布失败：未知错误'
      console.error('[Canvas][save] error', { message })
      storeSet({ globalError: message })
      // 同时写一条日志，便于左侧排查（不依赖 UI 展示）
      try {
        storeGet().appendLog({
          level: 'error',
          status: 'error',
          scope: 'node',
          message: `保存画布失败：${message}`,
        })
      } catch {
        // no-op
      }
    })
  }, CANVAS_SAVE_DEBOUNCE_MS)
}

/** localStorage：收藏夹持久化 key（版本化，便于未来迁移） */
const FAVORITES_KEY = 'flow-canvas:favorites:v1'
/** localStorage：UI 折叠状态持久化 key（版本化，便于未来迁移） */
const UI_KEY = 'flow-canvas:ui:v1'

function imageActionToLabel(action: ImageAction | string): string {
  switch (action) {
    case 'repaint_local':
      return '局部重绘'
    case 'erase':
      return '消除笔'
    case 'repaint_text':
      return '文字重绘'
    case 'tweak':
      return '画面微调'
    case 'generate_video':
      return '生成视频'
    default:
      return String(action)
  }
}
function loadFavorites(): FavoriteItem[] {
  /**
   * 数据流：localStorage → favorites（store）
   * - 目标：容错读取（JSON 破损/字段缺失不影响启动）
   * - 策略：只保留 url 合法项；缺失 id/createdAt 时补齐
   */
  try {
    const raw = window.localStorage.getItem(FAVORITES_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed
      .map((x) => x as Partial<FavoriteItem>)
      .filter((x) => typeof x.url === 'string' && x.url.length > 0)
      .map((x) => ({
        id: typeof x.id === 'string' && x.id.length > 0 ? x.id : `fav_${crypto.randomUUID()}`,
        url: x.url!,
        createdAt: typeof x.createdAt === 'number' ? x.createdAt : Date.now(),
      }))
  } catch {
    return []
  }
}

function persistFavorites(favorites: FavoriteItem[]) {
  /** 数据流：favorites（store）→ localStorage */
  try {
    window.localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites))
  } catch {
    // no-op
  }
}

function loadUi(): { leftPanelCollapsed: boolean; rightPanelCollapsed: boolean } {
  /** 数据流：localStorage → UI 折叠状态（store） */
  try {
    const raw = window.localStorage.getItem(UI_KEY)
    if (!raw) return { leftPanelCollapsed: false, rightPanelCollapsed: false }
    const parsed = JSON.parse(raw) as unknown as Partial<{
      leftPanelCollapsed: boolean
      rightPanelCollapsed: boolean
    }>
    return {
      leftPanelCollapsed: Boolean(parsed.leftPanelCollapsed),
      rightPanelCollapsed: Boolean(parsed.rightPanelCollapsed),
    }
  } catch {
    return { leftPanelCollapsed: false, rightPanelCollapsed: false }
  }
}

function persistUi(ui: { leftPanelCollapsed: boolean; rightPanelCollapsed: boolean }) {
  /** 数据流：UI 折叠状态（store）→ localStorage */
  try {
    window.localStorage.setItem(UI_KEY, JSON.stringify(ui))
  } catch {
    // no-op
  }
}

function stopProgress(key: string) {
  const t = progressTimers.get(key)
  if (t) {
    window.clearInterval(t)
    progressTimers.delete(key)
  }
}

function stopAllProgressForNode(nodeId: string) {
  const prefix = `${nodeId}::`
  for (const key of progressTimers.keys()) {
    if (key === nodeId || key.startsWith(prefix)) stopProgress(key)
  }
}

function calcOverallProgress(items: Array<{ progress: number }> | undefined, fallback: number): number {
  if (!items || items.length === 0) return fallback
  const sum = items.reduce((a, b) => a + (Number.isFinite(b.progress) ? b.progress : 0), 0)
  return Math.max(0, Math.min(100, Math.round(sum / items.length)))
}

function getNodeApproxSize(type: NodeType): { w: number; h: number } {
  // 用于“换位”的矩形近似：不追求像素级精确，只要避免明显重叠即可
  switch (type) {
    case 'text_input':
      return { w: 288, h: 180 }
    case 'llm_generate':
      return { w: 340, h: 300 }
    case 'image':
      return { w: 480, h: 420 }
    case 'video':
      return { w: 360, h: 360 }
    default:
      return { w: 320, h: 260 }
  }
}

function rectsOverlap(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number },
  margin = 16,
): boolean {
  // a 的矩形，考虑 margin 扩张边界（更保守，避免“擦边重叠”）
  const ax1 = a.x - margin
  const ay1 = a.y - margin
  const ax2 = a.x + a.w + margin
  const ay2 = a.y + a.h + margin

  const bx1 = b.x
  const by1 = b.y
  const bx2 = b.x + b.w
  const by2 = b.y + b.h

  return ax1 < bx2 && ax2 > bx1 && ay1 < by2 && ay2 > by1
}

/**
 * 结果节点自动换位（避免覆盖现有节点）
 *
 * 规则：
 * - preferred 默认放在源节点右侧：x + 420，y 同位
 * - 若与现有节点矩形重叠，则先在 y 方向下移多行；
 * - 若仍冲突，再向右移一档并重置 y。
 */
function findFreeNodePosition(
  preferred: { x: number; y: number },
  targetType: NodeType,
  nodes: CanvasNode[],
): { x: number; y: number } {
  const { w, h } = getNodeApproxSize(targetType)

  const stepX = 420
  const stepY = 160
  const maxAttempts = 36
  const sameXRowCount = 6 // 每档尝试 6 行（y 方向）
  const otherRects = nodes.map((n) => {
    const size = getNodeApproxSize(n.type as NodeType)
    return { id: n.id, x: n.position.x, y: n.position.y, w: size.w, h: size.h }
  })

  for (let i = 0; i < maxAttempts; i++) {
    const row = Math.floor(i / sameXRowCount)
    const col = i % sameXRowCount
    const candidate = { x: preferred.x + row * stepX, y: preferred.y + col * stepY, w, h }
    const collided = otherRects.some((r) => rectsOverlap(candidate, r))
    if (!collided) return { x: candidate.x, y: candidate.y }
  }

  // 实在找不到可用位置：返回 preferred，保证功能不中断
  return preferred
}

export const useCanvasStore = create<CanvasState>((set, get) => ({
  nodes: [],
  edges: [],
  isRunning: false,
  globalError: null,
  selectedNodeId: null,
  logs: [],
  favorites: loadFavorites(),
  favoritesOpen: false,
  preview: null,
  ...loadUi(),
  nodeMenu: null,
  chatMessages: [],
  generateImageFn: null,
  applyImageActionFn: null,
  generateVideoFn: null,
  startAiTaskFn: null,
  getAiTaskStatusFn: null,
  saveCanvasFn: null,

  setNodes: (nodes) => set({ nodes }),
  setEdges: (edges) => set({ edges }),

  onNodesChange: (changes) => {
    const nextNodes = applyNodeChanges(changes, get().nodes)
    set({ nodes: nextNodes })
    scheduleCanvasSave(get, set)
  },
  onEdgesChange: (changes) => {
    const nextEdges = applyEdgeChanges(changes, get().edges)
    set({ edges: nextEdges })
    scheduleCanvasSave(get, set)
  },
  onConnect: (connection) => {
    /**
     * 连接规则（数据层兜底）：
     * - video 节点只能作为“终止节点”：禁止从 video 往外连（UI 去掉 source handle，但这里仍做约束，避免被程序/未来 UI 绕过）
     * - 其他节点：允许按 ReactFlow 默认策略新增边
     */
    const state = get()
    const sourceNode = state.nodes.find((n) => n.id === connection.source)
    if (sourceNode?.type === 'video') return

    const nextEdges = addEdge(connection, state.edges)
    if (hasDagCycle(state.nodes, nextEdges)) {
      const message = '检测到环（cycle），该连线会导致流程无法执行，请调整连线后再试。'
      set({ globalError: message })
      return
    }

    set({ edges: nextEdges, globalError: null })
    scheduleCanvasSave(get, set)
  },

  setSelectedNodeId: (nodeId) => set({ selectedNodeId: nodeId }),
  appendLog: (entry) =>
    set((state) => {
      const next: CanvasLogEntry = {
        ...entry,
        id: `log_${crypto.randomUUID()}`,
        createdAt: Date.now(),
      }
      // 限制数量，避免无限增长
      const logs = [...state.logs, next].slice(-250)
      return { ...state, logs }
    }),
  clearLogs: () => set({ logs: [] }),
  toggleLeftPanel: () =>
    set((state) => {
      const next = {
        leftPanelCollapsed: !state.leftPanelCollapsed,
        rightPanelCollapsed: state.rightPanelCollapsed,
      }
      persistUi(next)
      return { ...state, ...next }
    }),
  toggleRightPanel: () =>
    set((state) => {
      const next = {
        leftPanelCollapsed: state.leftPanelCollapsed,
        rightPanelCollapsed: !state.rightPanelCollapsed,
      }
      persistUi(next)
      return { ...state, ...next }
    }),
  openFavorites: () => set({ favoritesOpen: true }),
  closeFavorites: () => set({ favoritesOpen: false }),
  addFavorite: (url) =>
    set((state) => {
      const trimmed = url.trim()
      if (trimmed.length === 0) return state
      const existed = state.favorites.some((f) => f.url === trimmed)
      const favorites = existed
        ? state.favorites
        : [
            ...state.favorites,
            { id: `fav_${crypto.randomUUID()}`, url: trimmed, createdAt: Date.now() },
          ]
      persistFavorites(favorites)
      return { ...state, favorites }
    }),
  removeFavoriteByUrl: (url) =>
    set((state) => {
      const trimmed = url.trim()
      if (trimmed.length === 0) return state
      const favorites = state.favorites.filter((f) => f.url !== trimmed)
      persistFavorites(favorites)
      return { ...state, favorites }
    }),
  toggleFavorite: (url) =>
    set((state) => {
      const trimmed = url.trim()
      if (trimmed.length === 0) return state
      const existed = state.favorites.some((f) => f.url === trimmed)
      const favorites = existed
        ? state.favorites.filter((f) => f.url !== trimmed)
        : [
            ...state.favorites,
            { id: `fav_${crypto.randomUUID()}`, url: trimmed, createdAt: Date.now() },
          ]
      persistFavorites(favorites)
      return { ...state, favorites }
    }),
  removeFavorite: (favoriteId) =>
    set((state) => {
      const favorites = state.favorites.filter((f) => f.id !== favoriteId)
      persistFavorites(favorites)
      return { ...state, favorites }
    }),
  isFavorite: (url) => {
    const trimmed = url.trim()
    if (trimmed.length === 0) return false
    return get().favorites.some((f) => f.url === trimmed)
  },
  openPreview: ({ title, imageUrl }) => set({ preview: { title, imageUrl } }),
  closePreview: () => set({ preview: null }),
  openNodeMenu: (nodeId, anchor) => set({ nodeMenu: { nodeId, anchor } }),
  closeNodeMenu: () => set({ nodeMenu: null }),
  appendChatMessage: (message) =>
    set((state) => ({
      chatMessages: [
        ...state.chatMessages,
        {
          ...message,
          id: `msg_${crypto.randomUUID()}`,
          createdAt: Date.now(),
        },
      ],
    })),
  deleteNode: (nodeId) => {
    set((state) => {
      stopAllProgressForNode(nodeId)
      const nodes = state.nodes.filter((n) => n.id !== nodeId)
      const edges = state.edges.filter(
        (e) => e.source !== nodeId && e.target !== nodeId,
      )
      const selectedNodeId =
        state.selectedNodeId === nodeId ? null : state.selectedNodeId
      const nodeMenu = state.nodeMenu?.nodeId === nodeId ? null : state.nodeMenu
      return { nodes, edges, selectedNodeId, nodeMenu }
    })
    scheduleCanvasSave(get, set)
  },
  setGenerateImageFn: (fn) => set({ generateImageFn: fn }),
  setApplyImageActionFn: (fn) => set({ applyImageActionFn: fn }),
  setGenerateVideoFn: (fn) => set({ generateVideoFn: fn }),
  setStartAiTaskFn: (fn) => set({ startAiTaskFn: fn }),
  setGetAiTaskStatusFn: (fn) => set({ getAiTaskStatusFn: fn }),
  setSaveCanvasFn: (fn) => set({ saveCanvasFn: fn }),

  addNode: (type, position) => {
    const id = `${type}-${nodeSeq++}`

    const base = {
      id,
      type,
      position,
    } as const

    const node: CanvasNode = (() => {
      if (type === 'text_input') {
        return {
          ...base,
          data: {
            title: 'Text Input',
            text: '',
            status: 'idle',
          },
        }
      }

      if (type === 'llm_generate') {
        return {
          ...base,
          data: {
            title: 'LLM Generate',
            prompt: '',
            status: 'idle',
          },
        }
      }

      if (type === 'video') {
        return {
          ...base,
          data: {
            title: 'Video',
            videos: [],
            activeIndex: 0,
            status: 'idle',
          },
        }
      }

      return {
        ...base,
        data: {
          title: 'Image',
          images: [],
          activeIndex: 0,
          selectedIndexes: [],
          status: 'idle',
        },
      }
    })()

    set({ nodes: [...get().nodes, node] })
    scheduleCanvasSave(get, set)
  },

  updateNodeData: (nodeId, updater) =>
    (() => {
      set((state) => ({
        nodes: state.nodes.map((n) =>
          n.id === nodeId ? ({ ...n, data: updater(n.data) } as CanvasNode) : n,
        ),
      }))
      scheduleCanvasSave(get, set)
    })(),

  run: async (_generateImage) => {
    /**
     * start+poll 执行图片操作（局部重绘/抠图/去背景/微调等）
     *
     * - 结果节点会先创建占位：`image-*`，并预置 `aiTask.items`（每张图一个 item）
     * - 针对每张选中源图启动后端任务（`kind=image_action`）
     * - 轮询中实时回填：
     *   - `resultNode.aiTask.items[idx]`：progress/status/errorMessage
     *   - `resultNode.images[idx]`：成功后立即写入 resultUrl
     * - 轮询失败/超时：回填 error，并在全部完成后按成功率把 result 节点置为 success/error
     */
    const startAiTask = get().startAiTaskFn
    const getAiTaskStatus = get().getAiTaskStatusFn
    if (!startAiTask || !getAiTaskStatus) {
      set({ globalError: 'API 未就绪：请确认后端已启动' })
      return
    }

    if (get().isRunning) return

    /**
     * DAG 全量执行的数据流：
     * - 输入：当前 `nodes/edges` + `generateImage`（由 useApi 注入的后端调用函数）
     * - 执行：`executeDag` 内部做拓扑排序（Kahn）+ 循环检测 + 逐节点执行
     * - 输出：这里目前只回收 llm_generate 的“最终图片 URL”（`llmImagesByNodeId`）
     * - 回填：把执行结果写回节点 data，并写入日志（dag/node 两个 scope）
     *
     * 说明：本 store 不直接持有“执行器的中间过程”，只持有最终可展示状态，避免状态爆炸。
     */
    get().appendLog({
      level: 'info',
      status: 'start',
      scope: 'dag',
      message: `开始执行 DAG（nodes=${get().nodes.length}, edges=${get().edges.length}）`,
    })
    set({ isRunning: true, globalError: null })

    // 先把所有节点标记为 running，并清理历史结果/错误，避免看起来像“复用旧图”
    set((state) => ({
      nodes: state.nodes.map((n) => {
        if (n.type === 'text_input') {
          const data = n.data as TextInputData
          return {
            ...n,
            data: {
              ...data,
              status: 'running',
              errorMessage: undefined,
            },
          } as CanvasNode
        }

        if (n.type === 'llm_generate') {
          const data = n.data as LlmGenerateData
          return {
            ...n,
            data: {
              ...data,
              status: 'running',
              errorMessage: undefined,
              resultImageUrl: undefined,
            },
          } as CanvasNode
        }

        if (n.type === 'image') {
          const data = n.data as ImageData
          return {
            ...n,
            data: {
              ...data,
              status: 'running',
              errorMessage: undefined,
            },
          } as CanvasNode
        }

        return n
      }),
    }))

    try {
      get().appendLog({
        level: 'info',
        status: 'running',
        scope: 'dag',
        message: 'DAG 执行中…',
      })
      const { llmImagesByNodeId } = await executeDag({
        nodes: get().nodes,
        edges: get().edges,
        startAiTask,
        getAiTaskStatus,
      })

      /**
       * 执行成功回填策略：
       * - text_input / image：仅更新 status（这些节点自身不产生新的产物）
       * - llm_generate：若执行器返回了 URL，则写入 `resultImageUrl`
       */
      set((state) => ({
        nodes: state.nodes.map((n) => {
          if (n.type === 'text_input') {
            const data = n.data as TextInputData
            return {
              ...n,
              data: { ...data, status: 'success', errorMessage: undefined },
            } as CanvasNode
          }

          if (n.type === 'image') {
            const data = n.data as ImageData
            return {
              ...n,
              data: { ...data, status: 'success', errorMessage: undefined },
            } as CanvasNode
          }

          if (n.type !== 'llm_generate') return n
          const url = llmImagesByNodeId.get(n.id)
          if (!url) return n
          const data = n.data as LlmGenerateData
          get().appendLog({
            level: 'success',
            status: 'success',
            scope: 'node',
            nodeId: n.id,
            nodeType: 'llm_generate',
            message: '生成成功',
            result: { nodeId: n.id },
          })
          return {
            ...n,
            data: {
              ...data,
              status: 'success',
              resultImageUrl: url,
              errorMessage: undefined,
            },
          } as CanvasNode
        }),
      }))

      get().appendLog({
        level: 'success',
        status: 'success',
        scope: 'dag',
        message: 'DAG 执行完成',
      })
      // DAG 运行完成后持久化一次画布数据（防抖会合并频繁触发）
      scheduleCanvasSave(get, set)
    } catch (e) {
      /**
       * 异常兜底：
       * - cycle：强提示“检查连线是否形成环”
       * - 其他错误：透传 error.message
       * - 回填：将可能受影响的节点标记为 error，并写入 globalError 与 logs
       */
      const message =
        e instanceof DagCycleError
          ? '检测到环（cycle），请检查连线，确保是 DAG'
          : e instanceof Error
            ? e.message
            : '执行失败：未知错误'

      set({ globalError: message })
      get().appendLog({
        level: 'error',
        status: 'error',
        scope: 'dag',
        message: `DAG 执行失败：${message}`,
      })
      set((state) => ({
        nodes: state.nodes.map((n) => {
          if (n.type === 'llm_generate') {
            const data = n.data as LlmGenerateData
            return {
              ...n,
              data: {
                ...data,
                status: 'error',
                errorMessage: message,
              },
            } as CanvasNode
          }

          if (n.type === 'image') {
            const data = n.data as ImageData
            return {
              ...n,
              data: {
                ...data,
                status: 'error',
                errorMessage: message,
              },
            } as CanvasNode
          }

          return n
        }),
      }))
      scheduleCanvasSave(get, set)
    } finally {
      set({ isRunning: false })
    }
  },

  runNode: async (nodeId) => {
    const startAiTask = get().startAiTaskFn
    const getAiTaskStatus = get().getAiTaskStatusFn
    if (!startAiTask || !getAiTaskStatus) {
      set({ globalError: 'API 未就绪：请确认后端已启动' })
      return
    }

    const node = get().nodes.find((n) => n.id === nodeId)
    if (!node || node.type !== 'llm_generate') return

    get().appendLog({
      level: 'info',
      status: 'start',
      scope: 'node',
      nodeId,
      nodeType: node.type,
      message: '开始单节点执行',
    })

    // 浏览器控制台打点：单节点运行（llm_generate）
    console.info('[AI][runNode] start', {
      nodeId,
      nodeType: node.type,
    })

    /**
     * 子图执行（到目标节点）的数据流：
     * - 目标：只执行“到 nodeId 为止”的上游依赖子图（不会执行与其无关的分支）
     * - UI：只把目标节点置为 running（上游节点不强制改状态，避免 UI 抖动）
     * - 执行：`executeDagToTarget` 负责提取子图 + 拓扑执行
     * - 回填：
     *   - llm_generate 的具体生成：由 `dagExecutor` 内部 start+poll 完成并返回最终 `resultUrl`
     *   - store：把返回的 URL 写入目标节点 `resultImageUrl`，失败则写入 `errorMessage`
     */
    set((state) => ({
      nodes: state.nodes.map((n) => {
        if (n.id !== nodeId) return n
        const data = n.data as LlmGenerateData
        return {
          ...n,
          data: {
            ...data,
            status: 'running',
            errorMessage: undefined,
            resultImageUrl: undefined,
          },
        } as CanvasNode
      }),
    }))

    try {
      const result = await executeDagToTarget({
        nodes: get().nodes,
        edges: get().edges,
        targetNodeId: nodeId,
        startAiTask,
        getAiTaskStatus,
      })

      const url = result.llmImagesByNodeId.get(nodeId)
      if (!url) throw new Error('未生成图片 URL')

      console.info('[AI][runNode] success', {
        nodeId,
        nodeType: node.type,
        imageUrl: url,
        executedNodeCount: result.executedNodeIds.size,
      })
      get().appendLog({
        level: 'success',
        status: 'success',
        scope: 'node',
        nodeId,
        nodeType: node.type,
        message: `单节点执行成功（executed=${result.executedNodeIds.size}）`,
        result: { nodeId, executedNodeCount: result.executedNodeIds.size },
      })

      set((state) => ({
        nodes: state.nodes.map((n) => {
          // 仅将本次执行到的节点标记 success（更贴近“单节点任务运行”）
          if (!result.executedNodeIds.has(n.id)) return n

          if (n.type === 'text_input') {
            const data = n.data as TextInputData
            return { ...n, data: { ...data, status: 'success' } } as CanvasNode
          }
          if (n.type === 'image') {
            const data = n.data as ImageData
            return { ...n, data: { ...data, status: 'success' } } as CanvasNode
          }
          if (n.type === 'llm_generate') {
            const data = n.data as LlmGenerateData
            return {
              ...n,
              data: {
                ...data,
                status: 'success',
                resultImageUrl: url,
                errorMessage: undefined,
              },
            } as CanvasNode
          }
          return n
        }),
      }))
      scheduleCanvasSave(get, set)
    } catch (e) {
      const message =
        e instanceof DagCycleError
          ? '检测到环（cycle），请检查连线，确保是 DAG'
          : e instanceof Error
            ? e.message
            : '执行失败：未知错误'

      console.error('[AI][runNode] error', {
        nodeId,
        nodeType: node.type,
        message,
      })

      set({ globalError: message })
      get().appendLog({
        level: 'error',
        status: 'error',
        scope: 'node',
        nodeId,
        nodeType: node.type,
        message: `单节点执行失败：${message}`,
      })
      set((state) => ({
        nodes: state.nodes.map((n) => {
          if (n.id !== nodeId) return n
          const data = n.data as LlmGenerateData
          return {
            ...n,
            data: { ...data, status: 'error', errorMessage: message },
          } as CanvasNode
        }),
      }))
      scheduleCanvasSave(get, set)
    }
  },

  runImageNodeAction: async ({ nodeId, action, prompt, mask }) => {
    const node = get().nodes.find((n) => n.id === nodeId)
    if (!node || node.type !== 'image') return

    const img = node.data as ImageData
    const clampIndex = (idx: number) =>
      Math.max(0, Math.min(idx, Math.max(0, img.images.length - 1)))
    const activeUrl = img.images[clampIndex(img.activeIndex)] ?? ''

    // 浏览器控制台打点：图片节点 AI 操作（便于调试/回放）
    console.info('[AI][imageAction] start', {
      nodeId,
      nodeType: node.type,
      action,
      prompt: prompt ?? '',
      sourceImageUrl: activeUrl,
      imageCount: img.images.length,
    })

    get().appendLog({
      level: 'info',
      status: 'start',
      scope: 'image_action',
      nodeId,
      nodeType: node.type,
      action,
      message: `开始图片操作：${imageActionToLabel(action)}${prompt ? `（prompt=${prompt}）` : ''}`,
      result: { imageCount: img.images.length },
    })

    // 任务生成结果节点时，需要以“源节点坐标”为基准做布局
    const sourceNodeNow = get().nodes.find((n) => n.id === nodeId)
    if (!sourceNodeNow) {
      set({ globalError: '源节点不存在' })
      return
    }

    /**
     * 输入图片选择策略（非常关键）：
     * - UI 通过 `selectedIndexes` 维护“要操作哪些图片”
     * - store 严格使用该集合对应的 URL 作为 `sourceImages`
     * - 若未选择任何图片：直接提示并返回，不启动任务（避免误操作对全量图片生效）
     */
    const clamp = (idx: number) => Math.max(0, Math.min(idx, Math.max(0, img.images.length - 1)))
    const selected = (img.selectedIndexes ?? []).map(clamp).filter((x, i, arr) => arr.indexOf(x) === i)
    const selectedImages = selected
      .map((idx) => (img.images[idx] ?? '').trim())
      .filter((u) => u.length > 0)

    if (selectedImages.length === 0) {
      const message = '请先勾选要操作的图片（最多展示 8 张）。'
      set({ globalError: message })
      get().appendLog({
        level: 'error',
        status: 'error',
        scope: 'image_action',
        nodeId,
        nodeType: node.type,
        action,
        message,
      })
      return
    }

    const sourceImages = selectedImages

    // 保存本次操作的来源信息，便于“再次生成”
    set((state) => ({
      nodes: state.nodes.map((n) => {
        if (n.id !== nodeId || n.type !== 'image') return n
        const d = n.data as ImageData
        return {
          ...n,
          data: {
            ...d,
            sourceNodeId: d.sourceNodeId ?? nodeId,
            sourceImages,
            sourceAction: action,
            sourcePrompt: prompt,
            sourceMask: action === 'repaint_local' ? mask : undefined,
          },
        } as CanvasNode
      }),
    }))

    if (action === 'generate_video') {
      /**
       * start+poll 生成视频（多图并发）
       *
       * - 每张选中源图启动一个后端任务：`kind=video_generate`
       * - 前端轮询对应 task 的 `status/progress/resultUrl`
       * - 实时回填源 `image` 节点的 `aiTask.items[idx]` 进度/错误
       * - 全部完成后创建 `video-*` 结果节点，并塞入最终 `videos` 列表
       */
      const startAiTask = get().startAiTaskFn
      const getAiTaskStatus = get().getAiTaskStatusFn
      if (!startAiTask || !getAiTaskStatus) {
        set({ globalError: 'API 未就绪：请确认后端已启动' })
        return
      }

      const taskId = `aitask_${crypto.randomUUID()}`
      const urls = sourceImages.length > 0 ? sourceImages : [activeUrl]
      const now = Date.now()
      const items = urls.map((_, idx) => ({ index: idx, status: 'running' as const, progress: 1 }))
      set((state) => ({
        nodes: state.nodes.map((n) => {
          if (n.id !== nodeId) return n
          const data = n.data as ImageData
          return {
            ...n,
            data: {
              ...data,
              status: 'running',
              errorMessage: undefined,
              lastAction: action,
              aiTask: {
                id: taskId,
                action,
                prompt,
                status: 'running',
                progress: calcOverallProgress(items, 1),
                items,
                createdAt: now,
                updatedAt: now,
              },
            },
          } as CanvasNode
        }),
      }))

      try {
        // 多图：对每张图片都生成一个视频链接
        const results = await Promise.all(
          urls.map(async (u, idx) => {
            // 全画布共享并发限制：最多 MAX_AI_CONCURRENCY 个真实后端任务并发运行
            const release = await aiConcurrencyLimiter.acquire()
            try {
              const { taskId: subTaskId } = await startAiTask({
                kind: 'video_generate',
                imageUrl: u,
                prompt,
              })

              const pollRes = await pollAiTask({
                taskId: subTaskId,
                intervalMs: 1000,
                timeoutMs: 30_000,
                getAiTaskStatus,
                shouldContinue: () => get().nodes.some((nn) => nn.id === nodeId),
                onUpdate: (st) => {
                  set((state) => ({
                    nodes: state.nodes.map((n) => {
                      if (n.id !== nodeId) return n
                      const d = n.data as ImageData
                      const nextItems = (d.aiTask?.items ?? items).slice()
                      const cur = nextItems[idx]
                      if (cur) {
                        if (st.status === 'running') {
                          nextItems[idx] = { ...cur, status: 'running', progress: st.progress }
                          nextItems[idx].errorMessage = undefined
                        } else if (st.status === 'success') {
                          nextItems[idx] = { ...cur, status: 'success', progress: 100, errorMessage: undefined }
                        } else {
                          nextItems[idx] = {
                            ...cur,
                            status: 'error',
                            progress: 100,
                            errorMessage: st.errorMessage ?? '任务失败',
                          }
                        }
                      }

                      const overallStatus =
                        nextItems.some((it) => it.status === 'error')
                          ? 'error'
                          : nextItems.every((it) => it.status === 'success')
                            ? 'success'
                            : 'running'

                      const overallProgress = calcOverallProgress(nextItems, st.progress)

                      return {
                        ...n,
                        data: {
                          ...d,
                          status: overallStatus,
                          errorMessage: overallStatus === 'error' ? st.errorMessage ?? '任务失败' : undefined,
                          lastAction: action,
                          aiTask: d.aiTask
                            ? {
                                ...d.aiTask,
                                status: overallStatus,
                                progress: overallProgress,
                                items: nextItems,
                                updatedAt: Date.now(),
                              }
                            : d.aiTask,
                        },
                      } as CanvasNode
                    }),
                  }))
                },
              })

              if (!pollRes.resultUrl) throw new Error('视频 URL 为空')
              return { idx, videoUrl: pollRes.resultUrl }
            } finally {
              release()
            }
          }),
        )

        // 生成结果节点（Video）：只能由任务生成，不在左侧 palette 暴露
        const targetId = `video-${nodeSeq++}`
        const now = Date.now()
        const items = urls.map((_, idx) => ({ index: idx, status: 'success' as const, progress: 100 }))
        set((state) => {
          const sourceUpdated = state.nodes.map((n) => {
            if (n.id !== nodeId || n.type !== 'image') return n
            const d = n.data as ImageData
            return {
              ...n,
              data: {
                ...d,
                status: 'success',
                errorMessage: undefined,
                lastAction: action,
                aiTask: d.aiTask
                  ? { ...d.aiTask, status: 'success', progress: 100, items, updatedAt: now }
                  : d.aiTask,
              },
            } as CanvasNode
          })

          const videos = results
            .sort((a, b) => a.idx - b.idx)
            .map((r) => r.videoUrl)
            .filter(Boolean)

          const videoNode: CanvasNode = {
            id: targetId,
            type: 'video',
            position: findFreeNodePosition(
              { x: sourceNodeNow.position.x + 420, y: sourceNodeNow.position.y },
              'video',
              get().nodes,
            ),
            data: {
              title: 'Video (Result)',
              videos,
              activeIndex: 0,
              status: 'success',
              sourceNodeId: nodeId,
              sourceImages: urls,
              sourceAction: action,
              sourcePrompt: prompt,
              aiTask: {
                id: taskId,
                action,
                prompt,
                status: 'success',
                progress: 100,
                items,
                createdAt: now,
                updatedAt: now,
              },
            },
          }

          const newEdge = {
            id: `e_${nodeId}_${targetId}_${crypto.randomUUID()}`,
            source: nodeId,
            target: targetId,
          }

          return {
            ...state,
            nodes: [...sourceUpdated, videoNode],
            edges: [...state.edges, newEdge],
            selectedNodeId: targetId,
          }
        })
        console.info('[AI][imageAction] success', {
          nodeId,
          nodeType: node.type,
          action,
          videoCount: results.length,
        })
        get().appendLog({
          level: 'success',
          status: 'success',
          scope: 'image_action',
          nodeId,
          nodeType: node.type,
          action,
          message: `${imageActionToLabel(action)}成功（count=${results.length}）`,
          result: results.map((r) => ({ idx: r.idx })),
        })
        set((state) => ({
          nodes: state.nodes.map((n) => {
            if (n.id !== nodeId) return n
            const data = n.data as ImageData
            return {
              ...n,
              data: {
                ...data,
                status: 'success',
                errorMessage: undefined,
                lastAction: action,
                aiTask: data.aiTask
                  ? { ...data.aiTask, status: 'success', progress: 100, updatedAt: Date.now() }
                  : {
                      id: taskId,
                      action,
                      prompt,
                      status: 'success',
                      progress: 100,
                      items,
                      createdAt: Date.now(),
                      updatedAt: Date.now(),
                    },
              },
            } as CanvasNode
          }),
        }))
        scheduleCanvasSave(get, set)
        for (const r of results) {
          get().appendChatMessage({
            role: 'user',
            kind: 'text',
            text: `生成视频（模拟）#${r.idx + 1}：${r.videoUrl}`,
          })
        }
      } catch (e) {
        const message = e instanceof Error ? e.message : '生成视频失败'
        console.error('[AI][imageAction] error', {
          nodeId,
          nodeType: node.type,
          action,
          message,
        })
        set({ globalError: message })
        get().appendLog({
          level: 'error',
          status: 'error',
          scope: 'image_action',
          nodeId,
          nodeType: node.type,
          action,
          message: `${imageActionToLabel(action)}失败：${message}`,
        })
        set((state) => ({
          nodes: state.nodes.map((n) => {
            if (n.id !== nodeId) return n
            const data = n.data as ImageData
            return {
              ...n,
              data: {
                ...data,
                status: 'error',
                errorMessage: message,
                lastAction: action,
                aiTask: data.aiTask
                  ? { ...data.aiTask, status: 'error', progress: 100, updatedAt: Date.now() }
                  : {
                      id: taskId,
                      action,
                      prompt,
                      status: 'error',
                      progress: 100,
                      createdAt: Date.now(),
                      updatedAt: Date.now(),
                    },
              },
            } as CanvasNode
          }),
        }))
        scheduleCanvasSave(get, set)
      }
      return
    }

    const startAiTask = get().startAiTaskFn
    const getAiTaskStatus = get().getAiTaskStatusFn
    if (!startAiTask || !getAiTaskStatus) {
      set({ globalError: 'API 未就绪：请确认后端已启动' })
      return
    }

    set((state) => ({
      nodes: state.nodes.map((n) => {
        if (n.id !== nodeId) return n
        const data = n.data as ImageData
        return {
          ...n,
          data: { ...data, status: 'running', errorMessage: undefined, lastAction: action },
        } as CanvasNode
      }),
    }))

    try {
      const urls = sourceImages.length > 0 ? sourceImages : [activeUrl]

      // 结果应该是一个“多图片结果节点”
      const targetId = `image-${nodeSeq++}`
      const taskId = `aitask_${crypto.randomUUID()}`
      set((state) => {
        const sourceUpdated = state.nodes.map((n) => {
          if (n.id !== nodeId) return n
          const data = n.data as ImageData
          return {
            ...n,
            data: { ...data, status: 'success', errorMessage: undefined, lastAction: action },
          } as CanvasNode
        })

        const placeholderImages = urls.map(() => '')
        const items = urls.map((_, idx) => ({ index: idx, status: 'running' as const, progress: 1 }))
        const now = Date.now()

        const newNode: CanvasNode = {
          id: targetId,
          type: 'image',
          position: findFreeNodePosition(
            { x: sourceNodeNow.position.x + 420, y: sourceNodeNow.position.y },
            'image',
            get().nodes,
          ),
          data: {
            title: `Image (Result)`,
            images: placeholderImages,
            activeIndex: 0,
            status: 'running',
            lastAction: action,
            sourceNodeId: nodeId,
            sourceImages: urls,
            sourceAction: action,
            sourcePrompt: prompt,
            aiTask: {
              id: taskId,
              action,
              prompt,
              status: 'running',
              progress: 1,
              items,
              createdAt: now,
              updatedAt: now,
            },
          },
        }

        const newEdge = {
          id: `e_${nodeId}_${targetId}_${crypto.randomUUID()}`,
          source: nodeId,
          target: targetId,
        }

        return {
          ...state,
          nodes: [...sourceUpdated, newNode],
          edges: [...state.edges, newEdge],
          selectedNodeId: targetId,
        }
      })
      // 新增结果节点后：立即持久化一次（防抖会合并后续状态更新）
      scheduleCanvasSave(get, set)

          // 多图：对每张图片启动“后端任务（start）+轮询（poll）”，并将结果逐步回填到同一个结果节点的 images[idx]
      const okFlags: boolean[] = urls.map(() => false)
      await Promise.all(
        urls.map(async (u, idx) => {
          const release = await aiConcurrencyLimiter.acquire()
          try {
            const { taskId: subTaskId } = await startAiTask({
              kind: 'image_action',
              imageUrl: u,
              action,
              prompt,
              mask: action === 'repaint_local' ? mask : undefined,
            })

            const pollRes = await pollAiTask({
              taskId: subTaskId,
              intervalMs: 1000,
              timeoutMs: 30_000,
              getAiTaskStatus,
              shouldContinue: () => get().nodes.some((n) => n.id === targetId),
              onUpdate: (st) => {
                set((state) => ({
                  nodes: state.nodes.map((n) => {
                    if (n.id !== targetId || n.type !== 'image') return n
                    const d = n.data as ImageData
                    const images = d.images.slice()
                    const items = (d.aiTask?.items ?? []).slice()
                    if (!items[idx]) return n

                    if (st.status === 'running') {
                      items[idx] = { ...items[idx], status: 'running', progress: st.progress, errorMessage: undefined }
                    } else if (st.status === 'success') {
                      if (st.resultUrl) images[idx] = st.resultUrl
                      items[idx] = { ...items[idx], status: 'success', progress: 100, errorMessage: undefined }
                    } else {
                      items[idx] = {
                        ...items[idx],
                        status: 'error',
                        progress: 100,
                        errorMessage: st.errorMessage ?? '任务失败',
                      }
                    }

                    const overallStatus =
                      items.some((it) => it.status === 'error')
                        ? 'error'
                        : items.every((it) => it.status === 'success')
                          ? 'success'
                          : 'running'

                    const overallProgress = calcOverallProgress(items, st.progress)

                    return {
                      ...n,
                      data: {
                        ...d,
                        images,
                        status: overallStatus,
                        errorMessage: overallStatus === 'error' ? items[idx]?.errorMessage : undefined,
                        aiTask: d.aiTask
                          ? {
                              ...d.aiTask,
                              status: overallStatus,
                              progress: overallProgress,
                              items,
                              updatedAt: Date.now(),
                            }
                          : d.aiTask,
                      },
                    } as CanvasNode
                  }),
                }))
              },
            })

            okFlags[idx] = true
            const newUrl = pollRes.resultUrl ?? ''

            get().appendLog({
              level: 'success',
              status: 'success',
              scope: 'image_action',
              nodeId,
              nodeType: node.type,
              action,
              message: `${imageActionToLabel(action)}成功 #${idx + 1}`,
              result: { targetNodeId: targetId, imageIndex: idx },
            })

            if (newUrl) get().appendChatMessage({ role: 'user', kind: 'image', imageUrl: newUrl })
          } catch (e) {
            okFlags[idx] = false
            const message = e instanceof Error ? e.message : '操作失败'
            console.error('[AI][imageAction] error', {
              nodeId,
              nodeType: node.type,
              action,
              imageIndex: idx,
              message,
            })

            // pollAiTask 内部已尽可能写入 items 状态；这里再补一次，保证 UI 不会“卡在 running”
            set((state) => ({
              nodes: state.nodes.map((n) => {
                if (n.id !== targetId || n.type !== 'image') return n
                const d = n.data as ImageData
                const images = d.images.slice()
                const items = (d.aiTask?.items ?? []).slice()
                if (items[idx]) items[idx] = { ...items[idx], progress: 100, status: 'error', errorMessage: message }

                const overallStatus =
                  items.some((it) => it.status === 'error')
                    ? 'error'
                    : items.every((it) => it.status === 'success')
                      ? 'success'
                      : 'running'

                const overallProgress = calcOverallProgress(items, 100)

                return {
                  ...n,
                  data: {
                    ...d,
                    images,
                    status: overallStatus,
                    errorMessage: overallStatus === 'error' ? message : undefined,
                    aiTask: d.aiTask
                      ? {
                          ...d.aiTask,
                          status: overallStatus,
                          progress: overallProgress,
                          items,
                          updatedAt: Date.now(),
                        }
                      : d.aiTask,
                  },
                } as CanvasNode
              }),
            }))

            get().appendLog({
              level: 'error',
              status: 'error',
              scope: 'image_action',
              nodeId,
              nodeType: node.type,
              action,
              message: `${imageActionToLabel(action)}失败 #${idx + 1}：${message}`,
              result: { targetNodeId: targetId, imageIndex: idx },
            })
          } finally {
            release()
          }
        }),
      )

      // 全部完成后：根据成功率设置节点状态
      const okCount = okFlags.filter(Boolean).length
      get().appendLog({
        level: okCount === urls.length ? 'success' : 'error',
        status: okCount === urls.length ? 'success' : 'error',
        scope: 'image_action',
        nodeId,
        nodeType: node.type,
        action,
        message:
          okCount === urls.length
            ? `图片操作完成（全部成功，共 ${urls.length} 张）`
            : `图片操作完成（部分失败：${urls.length - okCount}/${urls.length}）`,
      })
      set((state) => ({
        nodes: state.nodes.map((n) => {
          if (n.id !== targetId || n.type !== 'image') return n
          const d = n.data as ImageData
          const allOk = okCount === urls.length
          return {
            ...n,
            data: {
              ...d,
              status: allOk ? 'success' : 'error',
              errorMessage: allOk ? undefined : `部分失败：${urls.length - okCount}/${urls.length}`,
              aiTask: d.aiTask
                ? {
                    ...d.aiTask,
                    status: allOk ? 'success' : 'error',
                    progress: 100,
                    updatedAt: Date.now(),
                    items: d.aiTask.items?.map((it) => ({ ...it, progress: 100 })) ?? d.aiTask.items,
                  }
                : d.aiTask,
            },
          } as CanvasNode
        }),
      }))
      scheduleCanvasSave(get, set)
    } catch (e) {
      const message = e instanceof Error ? e.message : '操作失败'
      console.error('[AI][imageAction] error', {
        nodeId,
        nodeType: node.type,
        action,
        message,
      })
      set({ globalError: message })
      get().appendLog({
        level: 'error',
        status: 'error',
        scope: 'image_action',
        nodeId,
        nodeType: node.type,
        action,
        message: `图片操作失败：${message}`,
      })
      set((state) => ({
        nodes: state.nodes.map((n) => {
          if (n.id !== nodeId) return n
          const data = n.data as ImageData
          return {
            ...n,
            data: {
              ...data,
              status: 'error',
              errorMessage: message,
              lastAction: action,
              aiTask: data.aiTask
                ? { ...data.aiTask, status: 'error', progress: 100, updatedAt: Date.now() }
                : data.aiTask,
            },
          } as CanvasNode
        }),
      }))
      scheduleCanvasSave(get, set)
    }
  },
}))

