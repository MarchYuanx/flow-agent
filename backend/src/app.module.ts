import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { CanvasController } from './canvas.controller';
import { CanvasService } from './canvas.service';
import { AiTaskController } from './ai-task.controller';
import { AiTaskService } from './ai-task.service';

@Module({
  imports: [],
  controllers: [AppController, CanvasController, AiTaskController],
  providers: [AppService, CanvasService, AiTaskService],
})
export class AppModule {}
