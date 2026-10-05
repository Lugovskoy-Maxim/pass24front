// Read-only deployment diagnostics. Never print environment values or raw errors.
require('reflect-metadata');
const { ConfigService } = require('@nestjs/config');
const { MongoClient } = require('mongodb');
const {
  Bitrix24Client,
  Bitrix24Error,
} = require('../dist/integrations/bitrix24/bitrix24.client');

(async () => {
  const result = {};
  const bitrix = new Bitrix24Client(new ConfigService());
  result.bitrix = {
    enabled: bitrix.enabled(),
    configured: bitrix.configured(),
    ready: false,
  };
  if (bitrix.enabled()) {
    try {
      const funnel = await bitrix.funnel(true);
      result.bitrix = {
        ...result.bitrix,
        ready: true,
        funnelId: funnel.id,
        funnelName: funnel.name,
        stages: funnel.stages.map((stage) => ({
          name: stage.name,
          semantic: stage.semantic,
        })),
        pollIntervalSec: 60,
      };
    } catch (error) {
      result.bitrix.errorCode =
        error instanceof Bitrix24Error ? error.code : 'check_failed';
    }
  }
  let mongo;
  try {
    mongo = new MongoClient(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 5000,
    });
    await mongo.connect();
    const settings = await mongo
      .db()
      .collection('app_settings')
      .findOne(
        { key: 'global' },
        {
          projection: {
            _id: 0,
            tenantServiceRequestsEnabled: 1,
            'siteMysql.enabled': 1,
            'siteMysql.autoSyncEnabled': 1,
            'siteMysql.autoSyncSchedule': 1,
            'siteMysql.autoSyncTime': 1,
            'siteMysql.autoApply': 1,
            'siteMysql.lastCheckedAt': 1,
            'siteMysql.autoSyncLastDate': 1,
            'siteMysql.pendingChanges': 1,
            'siteMysql.lastSyncAt': 1,
            'siteMysql.lastSyncResult': 1,
            'siteMysql.lastSyncError': 1,
          },
        },
      );
    result.tenantServiceRequestsEnabled =
      settings?.tenantServiceRequestsEnabled === true;
    result.mysql = settings?.siteMysql || { enabled: false };
    result.crmQueuePending = await mongo
      .db()
      .collection('mstyle_ops_outbox')
      .countDocuments({ type: 'bitrix.message', state: { $ne: 'done' } });
  } catch {
    result.databaseErrorCode = 'check_failed';
  } finally {
    await mongo?.close();
  }
  console.log('INTEGRATIONS_CHECK ' + JSON.stringify(result));
})().catch(() => {
  console.log(
    'INTEGRATIONS_CHECK ' + JSON.stringify({ errorCode: 'check_failed' }),
  );
});
