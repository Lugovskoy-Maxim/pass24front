/**
 * Точка входа NestJS-приложения PASS24 / M-STYLE.
 *
 * Важно для разработки:
 * - Все HTTP-маршруты доступны под префиксом `/api` (фронт ходит на NEXT_PUBLIC_API_URL=…/api).
 * - Swagger UI: GET /api/docs
 * - ValidationPipe режет неизвестные поля (forbidNonWhitelisted) — DTO должны описывать все принимаемые поля.
 * - CORS origins перечислены явно; для нового dev-порта добавьте origin сюда или через env (если расширите).
 */
import { NestFactory } from '@nestjs/core';
import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/http-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Должен совпадать с путём на фронте: `/api/...`
  app.setGlobalPrefix('api');

  app.enableCors({
    // Консоль эндпоинтов открывают как файл или с другого хоста —
    // закрытый API всё равно требует сервисный токен.
    origin: true,
    credentials: true,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    allowedHeaders:
      'Content-Type, Accept, Authorization, X-Request-ID, Idempotency-Key, If-Match, If-None-Match',
    // Нужно для скачивания CSV (Content-Disposition)
    exposedHeaders:
      'Content-Disposition, Content-Type, Content-Length, ETag, Retry-After, X-Request-ID',
  });

  const http = app.getHttpAdapter().getInstance();
  http.use((req: { url?: string }, _res: unknown, next: () => void) => {
    if (req.url?.includes('password:verify')) {
      req.url = req.url.replace(/password:verify/g, 'password-verify');
    }
    next();
  });

  app.useGlobalFilters(new AllExceptionsFilter());

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // выкидывает поля вне DTO
      transform: true, // class-transformer (вложенные DTO, числа из query)
      forbidNonWhitelisted: true, // 400 при лишних полях
      exceptionFactory: (errors) => {
        const messages = errors.flatMap((e) => {
          if (e.constraints) return Object.values(e.constraints);
          if (e.children?.length) {
            return e.children.flatMap((c) =>
              c.constraints ? Object.values(c.constraints) : [],
            );
          }
          return [];
        });
        return new BadRequestException(
          messages.length ? messages : ['Проверьте введённые данные'],
        );
      },
    }),
  );

  const config = new DocumentBuilder()
    .setTitle('PASS24 API')
    .setDescription('Пропускная система для бизнес-центров')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  const port = process.env.PORT ?? 4000;
  await app.listen(port);
  console.log(`Backend running on http://localhost:${port}/api`);
  console.log(`Swagger: http://localhost:${port}/api/docs`);
}
bootstrap();
