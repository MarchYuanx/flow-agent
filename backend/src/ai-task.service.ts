import { Injectable } from '@nestjs/common';
import { createHash, randomUUID } from 'crypto';
import type { ImageAction } from './app.service';
import { AppService } from './app.service';

export type AiTaskKind = 'llm_generate' | 'image_action' | 'video_generate';
export type AiTaskStatus = 'running' | 'success' | 'error';

export type LlmGenerateTaskPayload = {
  prompt: string;
};

export type ImageActionTaskPayload = {
  imageUrl: string;
  action: ImageAction;
  prompt?: string;
  mask?: string;
};

export type VideoGenerateTaskPayload = {
  imageUrl: string;
  prompt?: string;
};

export type AiTaskStartPayload =
  | ({ kind: 'llm_generate' } & LlmGenerateTaskPayload)
  | ({ kind: 'image_action' } & ImageActionTaskPayload)
  | ({ kind: 'video_generate' } & VideoGenerateTaskPayload);

export type AiTaskStatusResponse = {
  taskId: string;
  status: AiTaskStatus;
  progress: number;
  resultUrl?: string;
  errorMessage?: string;
};

type TaskRecord = {
  taskId: string;
  kind: AiTaskKind;
  status: AiTaskStatus;
  progress: number;
  createdAt: number;
  durationMs: number;
  resultUrl?: string;
  errorMessage?: string;
  intervalHandle: NodeJS.Timeout | null;
};

@Injectable()
export class AiTaskService {
  private readonly tasks = new Map<string, TaskRecord>();

  constructor(private readonly appService: AppService) {}

  private getDurationMs() {
    // 与前端“体验”保持一致：5~10s
    return Math.floor(5000 + Math.random() * 5000);
  }

  private computeResultUrl(payload: AiTaskStartPayload): string {
    if (payload.kind === 'llm_generate') {
      const prompt = (payload.prompt ?? '').trim();
      const safePrompt = prompt.length > 0 ? prompt : 'EMPTY_PROMPT';
      return this.appService.generateWatermarkedImageUrl(safePrompt);
    }

    if (payload.kind === 'image_action') {
      const imageUrl = (payload.imageUrl ?? '').trim();
      const safeImageUrl = imageUrl.length > 0 ? imageUrl : 'EMPTY_IMAGE_URL';
      const action = payload.action ?? 'tweak';
      const prompt = payload.prompt;
      const mask = payload.mask?.trim();
      // mask 由前端“局部重绘 mask 画布”编码/压缩后的 token 透传而来。
      // 当前后端是 mock 实现：不做真正的像素级重绘，而是把 mask token 摘要拼进返回 URL，
      // 以便前端能观察到“不同遮罩会导致不同结果”的业务链路是否打通。
      const maskDigest = mask
        ? createHash('sha1').update(mask).digest('hex').slice(0, 8)
        : undefined;
      const { imageUrl: url } = this.appService.applyImageAction({
        imageUrl: safeImageUrl,
        action,
        prompt,
      });
      if (!maskDigest) return url;
      const joiner = url.includes('?') ? '&' : '?';
      return `${url}${joiner}mask=${encodeURIComponent(maskDigest)}`;
    }

    // video_generate
    const imageUrl = (payload.imageUrl ?? '').trim();
    const safeImageUrl = imageUrl.length > 0 ? imageUrl : 'EMPTY_IMAGE_URL';
    const prompt = payload.prompt;
    const { videoUrl } = this.appService.generateVideo({
      imageUrl: safeImageUrl,
      prompt,
    });
    return videoUrl;
  }

  start(payload: AiTaskStartPayload): { taskId: string } {
    const taskId = `task_${randomUUID()}`;
    const now = Date.now();
    const durationMs = this.getDurationMs();

    const record: TaskRecord = {
      taskId,
      kind: payload.kind,
      status: 'running',
      progress: 1,
      createdAt: now,
      durationMs,
      intervalHandle: setInterval(() => {
        const current = this.tasks.get(taskId);
        if (!current) return;
        if (current.status !== 'running') return;

        const elapsed = Date.now() - current.createdAt;
        const t = Math.min(1, elapsed / current.durationMs);
        // 保持观感：前期快慢变化，最后停在 99% 再由完成事件跳 100%
        const eased = 1 - Math.pow(1 - t, 2);
        const nextProgress = Math.max(1, Math.min(99, Math.round(eased * 99)));
        current.progress = nextProgress;

        if (t >= 1) {
          try {
            current.resultUrl = this.computeResultUrl(payload);
            current.status = 'success';
            current.progress = 100;
          } catch (e) {
            const message = e instanceof Error ? e.message : 'task failed';
            current.errorMessage = message;
            current.status = 'error';
            current.progress = 100;
          } finally {
            if (current.intervalHandle) clearInterval(current.intervalHandle);
            current.intervalHandle = null;
            this.tasks.set(taskId, current);
          }
        }
      }, 500),
    };

    this.tasks.set(taskId, record);
    return { taskId };
  }

  status(taskId: string): AiTaskStatusResponse {
    const record = this.tasks.get(taskId);
    if (!record) {
      return {
        taskId,
        status: 'error',
        progress: 0,
        errorMessage: 'Task not found',
      };
    }

    return {
      taskId,
      status: record.status,
      progress: record.progress,
      resultUrl: record.resultUrl,
      errorMessage: record.errorMessage,
    };
  }
}
