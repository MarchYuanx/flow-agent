import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { CanvasController } from './canvas.controller';
import { CanvasService } from './canvas.service';

@Module({
  imports: [],
  controllers: [AppController, CanvasController],
  providers: [AppService, CanvasService],
})
export class AppModule {}
