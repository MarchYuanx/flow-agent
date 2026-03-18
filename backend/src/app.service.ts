import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';

export type ImageAction =
  | 'repaint_local'
  | 'erase'
  | 'repaint_text'
  | 'tweak'
  | 'generate_video';

@Injectable()
export class AppService {
  /**
   * 仅模拟“生成带水印图片 URL”：
   * - 不做真实图片处理
   * - 通过 URL query 拼接 watermark 参数，前端展示时即可看到“专属水印”信息
   */
  generateWatermarkedImageUrl(prompt: string): string {
    const runId = randomUUID().slice(0, 8);

    // 用 seed 保证同一 prompt 在一次运行内可复现一个固定占位图（便于演示）
    const seed = encodeURIComponent(`${prompt}-${runId}`);
    const baseImageUrl = `https://picsum.photos/seed/${seed}/960/540`;

    // 关键点：水印逻辑只做 URL 参数拼接（模拟 watermark）
    const watermark = encodeURIComponent(`AI画布-${runId}`);
    const encodedPrompt = encodeURIComponent(prompt);

    return `${baseImageUrl}?watermark=${watermark}&prompt=${encodedPrompt}`;
  }

  /**
   * 仅模拟“图片节点 AI 操作”：
   * - 不做真实处理
   * - 用 seed + query 参数表达 action/prompt/watermark 等信息，前端可直接展示
   */
  applyImageAction(params: {
    imageUrl: string;
    action: ImageAction;
    prompt?: string;
  }): { imageUrl: string } {
    const runId = randomUUID().slice(0, 8);
    const safePrompt = (params.prompt ?? '').trim();
    const seed = encodeURIComponent(`${params.action}-${safePrompt}-${runId}`);
    const baseImageUrl = `https://picsum.photos/seed/${seed}/960/540`;

    const watermark = encodeURIComponent(`AI画布-${runId}`);
    const action = encodeURIComponent(params.action);
    const encodedPrompt = encodeURIComponent(safePrompt);
    const source = encodeURIComponent(params.imageUrl);

    return {
      imageUrl: `${baseImageUrl}?watermark=${watermark}&action=${action}&prompt=${encodedPrompt}&source=${source}`,
    };
  }

  /**
   * 仅模拟“生成视频”：返回一个可识别的 videoUrl（本质还是 URL 参数拼接）
   */
  generateVideo(params: {
    imageUrl: string;
    prompt?: string;
  }): { videoUrl: string } {
    const runId = randomUUID().slice(0, 8);
    const safePrompt = (params.prompt ?? '').trim();

    // 用一个可见的 URL 作为“视频”占位（不提供真实 mp4），前端可当作链接展示
    const base = `https://example.com/mock-video.mp4`;
    const watermark = encodeURIComponent(`AI画布-${runId}`);
    const encodedPrompt = encodeURIComponent(safePrompt);
    const source = encodeURIComponent(params.imageUrl);

    return {
      videoUrl: `${base}?watermark=${watermark}&prompt=${encodedPrompt}&source=${source}`,
    };
  }
}
