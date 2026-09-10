import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import { MstyleV2Config } from './mstyle-v2.config';
import { MSTYLE_MODELS } from './mstyle-v2.schemas';
import { problem } from './mstyle-v2.problem';

/** Integration initialization cannot prevent the native Pass application from starting. */
@Injectable()
export class MstyleReadinessService implements OnModuleInit {
  private readonly logger = new Logger(MstyleReadinessService.name);
  private ready = false;
  private pending?: Promise<void>;
  private retryAt = 0;

  constructor(
    @InjectConnection() private readonly connection: Connection,
    private readonly cfg: MstyleV2Config,
  ) {}

  onModuleInit() {
    void this.refresh();
  }

  async assertReady() {
    if (!this.ready) await this.waitForRefresh();
    if (!this.ready)
      problem(503, 'UPSTREAM_UNAVAILABLE', { retryable: true, retryAfter: 30 });
  }

  private async waitForRefresh() {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        this.refresh(),
        new Promise<void>((resolve) => {
          timeout = setTimeout(resolve, 10000);
        }),
      ]);
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }

  private refresh(): Promise<void> {
    if (this.pending) return this.pending;
    if (Date.now() < this.retryAt) return Promise.resolve();
    this.pending = this.initialize().finally(() => {
      this.pending = undefined;
    });
    return this.pending;
  }

  private async initialize() {
    try {
      this.cfg.assertReady();
      const hello = await this.connection.db!.admin().command({ hello: 1 });
      if (!hello.setName && hello.msg !== 'isdbgrid')
        throw new Error('Transactions require a replica set or mongos');
      for (const definition of MSTYLE_MODELS) {
        const model = this.connection.model(definition.name);
        // These collections belong exclusively to Mstyle V2. syncIndexes
        // upgrades legacy index options (for example non-unique identity
        // indexes) and removes obsolete M1 indexes before creating M2 ones.
        await model.createCollection();
        const removed = await model.syncIndexes();
        if (removed.length > 0) {
          this.logger.warn(
            `Synchronized ${definition.name} indexes; removed=${removed.join(',')}`,
          );
        }
      }
      this.ready = true;
      this.logger.log('Mstyle integration ready');
    } catch (error) {
      this.ready = false;
      this.retryAt = Date.now() + 30000;
      // MongoDB error messages can contain private field values from duplicate keys.
      this.logger.error(
        `Mstyle integration unavailable; error=${(error as Error).name || 'Error'}; code=${(error as { code?: number }).code || 'initialization'}`,
      );
    }
  }
}
