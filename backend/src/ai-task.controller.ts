import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import {
  AiTaskService,
  type AiTaskStartPayload,
  type AiTaskStatusResponse,
} from './ai-task.service';

@Controller('ai')
export class AiTaskController {
  constructor(private readonly aiTaskService: AiTaskService) {}

  @Post('task/start')
  start(@Body() body: AiTaskStartPayload): { taskId: string } {
    const raw = body as unknown as { kind?: unknown };
    const kind = raw.kind;

    if (
      kind !== 'llm_generate' &&
      kind !== 'image_action' &&
      kind !== 'video_generate'
    ) {
      // 保持极简实现：不依赖 ValidationPipe，这里手动容错
      return this.aiTaskService.start({ kind: 'llm_generate', prompt: '' });
    }

    return this.aiTaskService.start(body);
  }

  @Get('task/status/:taskId')
  status(@Param('taskId') taskId: string): AiTaskStatusResponse {
    return this.aiTaskService.status(taskId);
  }
}
