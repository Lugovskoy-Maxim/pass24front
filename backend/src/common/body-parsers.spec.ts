import {
  Body,
  Controller,
  INestApplication,
  Module,
  Post,
} from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import request from 'supertest';
import { configureBodyParsers } from './body-parsers';

@Controller()
class ParserProbe {
  @Post([
    'auth/login',
    'internal/integrations/mstyle/v2/operations/public',
    'oauth2/token',
    'admin/service-requests/attachments',
    'internal/integrations/mstyle/v2/operations/resident',
  ])
  read(@Body() body: any) {
    return {
      action: body?.action,
      scope: body?.scope,
      bytes: body?.file?.length || 0,
    };
  }
}
@Module({ controllers: [ParserProbe] })
class ParserProbeModule {}

describe('production HTTP body parsers', () => {
  let app: INestApplication;
  beforeAll(async () => {
    app = await NestFactory.create(ParserProbeModule, {
      logger: false,
      bodyParser: false,
    });
    app.setGlobalPrefix('api');
    configureBodyParsers(app);
    await app.init();
  });
  afterAll(async () => {
    await app.close();
  });

  it.each(['auth/login', 'internal/integrations/mstyle/v2/operations/public'])(
    'keeps ordinary JSON parsing for %s',
    async (path) => {
      const response = await request(app.getHttpServer())
        .post('/api/' + path)
        .send({ action: 'ownership' })
        .expect(201);
      expect(response.body.action).toBe('ownership');
    },
  );
  it('keeps URL-encoded OAuth requests', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/oauth2/token')
      .type('form')
      .send({ scope: 'mstyle.operations.public' })
      .expect(201);
    expect(response.body.scope).toBe('mstyle.operations.public');
  });
  it.each([
    'admin/service-requests/attachments',
    'internal/integrations/mstyle/v2/operations/resident',
  ])('allows attachment JSON only on %s', async (path) => {
    const response = await request(app.getHttpServer())
      .post('/api/' + path)
      .send({ file: 'a'.repeat(200000) })
      .expect(201);
    expect(response.body.bytes).toBe(200000);
  });
  it('keeps the ordinary request size limit', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ file: 'a'.repeat(200000) })
      .expect(413);
  });
});
