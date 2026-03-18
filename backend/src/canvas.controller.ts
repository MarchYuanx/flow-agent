import { Body, Controller, Get, NotFoundException, Param, Post } from '@nestjs/common'
import type { CanvasSavePayload } from './canvas.service'
import { CanvasService } from './canvas.service'

@Controller('canvas')
export class CanvasController {
  constructor(private readonly canvasService: CanvasService) {}

  @Post('save')
  async save(@Body() body: CanvasSavePayload): Promise<{ ok: true }> {
    const payload = {
      canvasId: body?.canvasId ?? 'default',
      nodes: Array.isArray(body?.nodes) ? body.nodes : [],
      edges: Array.isArray(body?.edges) ? body.edges : [],
    }
    await this.canvasService.saveCanvas(payload)
    return { ok: true }
  }

  @Get(':canvasId')
  async load(@Param('canvasId') canvasId: string): Promise<{ nodes: unknown[]; edges: unknown[] }> {
    const data = await this.canvasService.loadCanvas(canvasId)
    if (!data) throw new NotFoundException('Canvas not found')
    return data
  }
}

