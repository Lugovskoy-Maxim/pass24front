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
      const capabilities = await bitrix.capabilities().catch(() => null);
      result.bitrix = {
        ...result.bitrix,
        ready: true,
        capabilities,
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
    const db = mongo.db();
    const assignment = await db
      .collection('mstyle_ops_bitrix_state')
      .findOne({ _id: 'assignment-settings' });
    result.crmDefaultAssigneeConfigured = !!assignment?.user_id;
    result.crmCustomerLinks = {
      managedTickets: await db
        .collection('mstyle_ops_tickets')
        .countDocuments({ 'bitrix.managed': true }),
      enrichedTickets: await db
        .collection('mstyle_ops_tickets')
        .countDocuments({ 'bitrix.customer_version': 1 }),
      tenantCompanyLinks: await db
        .collection('mstyle_ops_bitrix_state')
        .countDocuments({ _id: /^tenant-company:/, company_id: { $gt: 0 } }),
    };
    result.crmCustomerChecks = [];
    if (bitrix.enabled()) {
      const tickets = await db
        .collection('mstyle_ops_tickets')
        .find(
          { 'bitrix.deal_id': { $exists: true } },
          { projection: { id: 1, bitrix: 1, office_id: 1, office_ids: 1 } },
        )
        .sort({ id: -1 })
        .limit(5)
        .toArray();
      for (const ticket of tickets) {
        try {
          const { result: deal } = await bitrix.call('crm.deal.get', {
            id: ticket.bitrix.deal_id,
          });
          const { result: contacts } = await bitrix.call(
            'crm.deal.contact.items.get',
            { id: ticket.bitrix.deal_id },
          );
          result.crmCustomerChecks.push({
            officeInTitle: /^Офис(?:ы)?\s.+ · /.test(deal.TITLE || ''),
            companyLinked: Number(deal.COMPANY_ID) > 0,
            contactCount: Array.isArray(contacts) ? contacts.length : 0,
            enriched: ticket.bitrix.customer_version === 1,
            customerErrorCode: ticket.bitrix.customer_error_code || '',
            assignmentErrorCode: ticket.bitrix.assignment_error_code || '',
          });
        } catch (error) {
          result.crmCustomerChecks.push({
            errorCode:
              error instanceof Bitrix24Error ? error.code : 'check_failed',
          });
        }
      }
    }
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
