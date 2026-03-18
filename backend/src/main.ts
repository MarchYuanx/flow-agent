import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.setGlobalPrefix('api');

  // 仅为前端开发提供跨域支持（极简配置）
  app.enableCors({
    origin: ['http://localhost:5173'],
    methods: ['GET', 'POST', 'OPTIONS'],
  });

  await app.listen(process.env.PORT ?? 3001);
}
bootstrap();
