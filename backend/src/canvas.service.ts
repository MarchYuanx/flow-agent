import { Injectable } from '@nestjs/common'
import { promises as fs } from 'fs'
import * as path from 'path'

export type CanvasSavePayload = {
  canvasId: string
  nodes: unknown[]
  edges: unknown[]
}

@Injectable()
export class CanvasService {
  private getDataDir() {
    return path.join(process.cwd(), 'data')
  }

  private getCanvasFile(canvasId: string) {
    // 仅允许简单字符，避免路径穿越
    const safeId = canvasId.replace(/[^a-zA-Z0-9_\-]/g, '_')
    return path.join(this.getDataDir(), `canvas-${safeId}.json`)
  }

  async saveCanvas(payload: CanvasSavePayload): Promise<void> {
    const file = this.getCanvasFile(payload.canvasId)
    await fs.mkdir(this.getDataDir(), { recursive: true })
    await fs.writeFile(file, JSON.stringify({ nodes: payload.nodes, edges: payload.edges }, null, 2), 'utf-8')
  }

  async loadCanvas(canvasId: string): Promise<{ nodes: unknown[]; edges: unknown[] } | null> {
    const file = this.getCanvasFile(canvasId)
    try {
      const raw = await fs.readFile(file, 'utf-8')
      const parsed = JSON.parse(raw) as unknown
      if (
        typeof parsed !== 'object' ||
        parsed === null ||
        !('nodes' in parsed) ||
        !('edges' in parsed)
      ) {
        return null
      }
      const nodes = (parsed as { nodes?: unknown }).nodes
      const edges = (parsed as { edges?: unknown }).edges
      return { nodes: Array.isArray(nodes) ? nodes : [], edges: Array.isArray(edges) ? edges : [] }
    } catch {
      return null
    }
  }
}

