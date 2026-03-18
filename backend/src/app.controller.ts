import { Body, Controller, Post } from '@nestjs/common';
import { AppService } from './app.service';
import type { ImageAction } from './app.service';

type GenerateRequestDto = {
  prompt: string;
};

type GenerateResponseDto = {
  images: string[];
};

type ImageActionRequestDto = {
  imageUrl: string;
  action: ImageAction;
  prompt?: string;
};

type ImageActionResponseDto = {
  imageUrl: string;
};

type VideoGenerateRequestDto = {
  imageUrl: string;
  prompt?: string;
};

type VideoGenerateResponseDto = {
  videoUrl: string;
};

@Controller('ai')
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Post('generate')
  generate(@Body() body: GenerateRequestDto): GenerateResponseDto {
    const prompt = (body?.prompt ?? '').trim();
    const safePrompt = prompt.length > 0 ? prompt : 'EMPTY_PROMPT';

    const url = this.appService.generateWatermarkedImageUrl(safePrompt);
    return { images: [url] };
  }

  @Post('image/action')
  imageAction(@Body() body: ImageActionRequestDto): ImageActionResponseDto {
    const imageUrl = (body?.imageUrl ?? '').trim();
    const action = body?.action;
    const prompt = body?.prompt;

    const safeImageUrl = imageUrl.length > 0 ? imageUrl : 'EMPTY_IMAGE_URL';
    const safeAction: ImageAction = action ?? 'tweak';

    return this.appService.applyImageAction({
      imageUrl: safeImageUrl,
      action: safeAction,
      prompt,
    });
  }

  @Post('video/generate')
  videoGenerate(@Body() body: VideoGenerateRequestDto): VideoGenerateResponseDto {
    const imageUrl = (body?.imageUrl ?? '').trim();
    const prompt = body?.prompt;
    const safeImageUrl = imageUrl.length > 0 ? imageUrl : 'EMPTY_IMAGE_URL';

    return this.appService.generateVideo({ imageUrl: safeImageUrl, prompt });
  }
}
