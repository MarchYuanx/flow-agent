import type { Edge } from '@xyflow/react'
import type {
  CanvasNode,
  ImageData,
  LlmGenerateData,
  TextInputData,
  VideoData,
} from '../store/canvasStore'

export type DagNodeId = string

export type DagExecutionResult = {
  llmImagesByNodeId: Map<DagNodeId, string>
}

export type DagTargetExecutionResult = {
  executedNodeIds: Set<DagNodeId>
  llmImagesByNodeId: Map<DagNodeId, string>
}

export class DagCycleError extends Error {
  public readonly type = 'DagCycleError'
  constructor(message = 'DAG 存在环，无法执行') {
    super(message)
  }
}

export class DagInvalidEdgeError extends Error {
  public readonly type = 'DagInvalidEdgeError'
  constructor(message = 'DAG 连线不合法') {
    super(message)
  }
}

type NodeOutput =
  | { kind: 'text'; text: string }
  | { kind: 'image'; url: string }

function topoSort(params: {
  nodes: CanvasNode[]
  edges: Edge[]
}): { topo: string[]; incomingSources: Map<string, string[]>; nodeById: Map<string, CanvasNode> } {
  const { nodes, edges } = params

  const nodeById = new Map(nodes.map((n) => [n.id, n]))
  const inDegree = new Map<string, number>()
  const outAdj = new Map<string, string[]>()

  for (const n of nodes) {
    inDegree.set(n.id, 0)
    outAdj.set(n.id, [])
  }

  for (const e of edges) {
    const src = e.source
    const tgt = e.target
    if (!nodeById.has(src) || !nodeById.has(tgt)) {
      throw new DagInvalidEdgeError(`边指向不存在的节点：${src} -> ${tgt}`)
    }
    outAdj.get(src)!.push(tgt)
    inDegree.set(tgt, (inDegree.get(tgt) ?? 0) + 1)
  }

  // Kahn：初始化队列为所有入度为 0 的节点
  const queue: string[] = []
  for (const [id, deg] of inDegree.entries()) {
    if (deg === 0) queue.push(id)
  }

  const topo: string[] = []
  while (queue.length > 0) {
    const id = queue.shift()!
    topo.push(id)
    for (const next of outAdj.get(id) ?? []) {
      const deg = (inDegree.get(next) ?? 0) - 1
      inDegree.set(next, deg)
      if (deg === 0) queue.push(next)
    }
  }

  if (topo.length !== nodes.length) {
    // 说明至少存在一个环（还有节点入度无法削减到 0）
    throw new DagCycleError()
  }

  // 为方便取上游输入：构建每个节点的入边列表（source ids）
  const incomingSources = new Map<string, string[]>()
  for (const n of nodes) incomingSources.set(n.id, [])
  for (const e of edges) incomingSources.get(e.target)!.push(e.source)

  return { topo, incomingSources, nodeById }
}

async function executeTopo(params: {
  topo: string[]
  nodeById: Map<string, CanvasNode>
  incomingSources: Map<string, string[]>
  generateImage: (prompt: string) => Promise<string>
  shouldExecute: (nodeId: string) => boolean
}): Promise<DagTargetExecutionResult> {
  const { topo, nodeById, incomingSources, generateImage, shouldExecute } = params

  const outputs = new Map<string, NodeOutput>()
  const llmImagesByNodeId = new Map<string, string>()
  const executedNodeIds = new Set<string>()

  for (const id of topo) {
    if (!shouldExecute(id)) continue
    const node = nodeById.get(id)
    if (!node) continue

    executedNodeIds.add(id)

    if (node.type === 'text_input') {
      const data = node.data as TextInputData
      outputs.set(id, { kind: 'text', text: data.text })
      continue
    }

    if (node.type === 'image') {
      const data = node.data as ImageData
      const idx = Math.max(0, Math.min(data.activeIndex, data.images.length - 1))
      const url = (data.images[idx] ?? '').trim()
      outputs.set(id, { kind: 'image', url })
      continue
    }

    if (node.type === 'video') {
      const data = node.data as VideoData
      const idx = Math.max(0, Math.min(data.activeIndex, data.videos.length - 1))
      const url = (data.videos[idx] ?? '').trim()
      // 当前 DAG 执行并不消费 video 输出，统一塞到 outputs 里便于未来扩展
      outputs.set(id, { kind: 'text', text: url })
      continue
    }

    if (node.type === 'llm_generate') {
      const data = node.data as LlmGenerateData

      const sources = incomingSources.get(id) ?? []
      const upstreamText = sources
        .map((sid) => outputs.get(sid))
        .find((o): o is { kind: 'text'; text: string } => o?.kind === 'text')
        ?.text

      const prompt = (upstreamText ?? data.prompt).trim()
      const safePrompt = prompt.length > 0 ? prompt : 'EMPTY_PROMPT'

      const url = await generateImage(safePrompt)
      outputs.set(id, { kind: 'image', url })
      llmImagesByNodeId.set(id, url)
      continue
    }
  }

  return { executedNodeIds, llmImagesByNodeId }
}

/**
 * DAG 执行器（拓扑排序 + 逐节点执行）
 *
 * 关键逻辑说明（按你要求加详细注释）：
 * - 使用 Kahn 算法做拓扑排序：统计每个节点入度 -> 入度为 0 的节点进队列 -> 依次出队并“削减”后继节点入度
 * - 若最终输出的排序长度 < 节点数，说明存在环（cycle），直接报错
 * - 执行阶段：按拓扑序遍历节点，使用一个 outputs map 保存“每个节点的产物”
 *   - text_input：产出 { text }
 *   - image：产出 { url }（静态资源，不调用后端）
 *   - llm_generate：消费上游 text（若存在）或节点自身 prompt，然后调用后端生成图片 URL
 */
export async function executeDag(params: {
  nodes: CanvasNode[]
  edges: Edge[]
  generateImage: (prompt: string) => Promise<string>
}): Promise<DagExecutionResult> {
  const { nodes, edges, generateImage } = params

  const { topo, incomingSources, nodeById } = topoSort({ nodes, edges })
  const result = await executeTopo({
    topo,
    incomingSources,
    nodeById,
    generateImage,
    shouldExecute: () => true,
  })
  return { llmImagesByNodeId: result.llmImagesByNodeId }
}

/**
 * 执行到指定节点（单节点运行用）
 *
 * 逻辑：从 target 往上游回溯出所有依赖节点集合 -> 只执行这些节点的拓扑序子集
 * - 这样点击某个 llm_generate 的 Run 时，不会把整张图上所有节点都跑一遍
 */
export async function executeDagToTarget(params: {
  nodes: CanvasNode[]
  edges: Edge[]
  targetNodeId: string
  generateImage: (prompt: string) => Promise<string>
}): Promise<DagTargetExecutionResult> {
  const { nodes, edges, targetNodeId, generateImage } = params
  const { topo, incomingSources, nodeById } = topoSort({ nodes, edges })

  if (!nodeById.has(targetNodeId)) {
    throw new DagInvalidEdgeError(`目标节点不存在：${targetNodeId}`)
  }

  // 从 target 回溯所有祖先依赖
  const need = new Set<string>()
  const stack: string[] = [targetNodeId]
  while (stack.length > 0) {
    const id = stack.pop()!
    if (need.has(id)) continue
    need.add(id)
    const sources = incomingSources.get(id) ?? []
    for (const s of sources) stack.push(s)
  }

  return executeTopo({
    topo,
    incomingSources,
    nodeById,
    generateImage,
    shouldExecute: (id) => need.has(id),
  })
}

