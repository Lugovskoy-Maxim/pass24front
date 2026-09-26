import type { INestApplication } from '@nestjs/common';
import { json, urlencoded } from 'express';

/** Use with Nest's bodyParser:false: a scoped jsonParser suppresses its default parser. */
export function configureBodyParsers(app: INestApplication): void {
  const attachmentJson = json({ limit: '15mb' });
  app.use('/api/admin/service-requests/attachments', attachmentJson);
  app.use(
    '/api/internal/integrations/mstyle/v2/operations/resident',
    attachmentJson,
  );
  app.use(json({ limit: '100kb' }));
  app.use(urlencoded({ extended: true, limit: '100kb' }));
}
