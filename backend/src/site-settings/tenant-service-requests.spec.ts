import { SiteSettingsService } from './site-settings.service';

describe('tenant service request setting', () => {
  it('defaults to hidden and persists enabling and hiding without changing other settings', async () => {
    const document: Record<string, unknown> = { siteName: 'M-STYLE' };
    const model = {
      findOne: () => ({ lean: async () => document }),
      findOneAndUpdate: (
        _filter: unknown,
        update: { $set: Record<string, unknown> },
      ) => {
        Object.assign(document, update.$set);
        return { lean: async () => document };
      },
    };
    const settings = new SiteSettingsService(model as any);
    expect((await settings.get()).tenantServiceRequestsEnabled).toBe(false);
    expect(
      (await settings.update({ tenantServiceRequestsEnabled: true }))
        .tenantServiceRequestsEnabled,
    ).toBe(true);
    expect((await settings.get()).tenantServiceRequestsEnabled).toBe(true);
    await settings.update({ tenantServiceRequestsEnabled: false });
    expect((await settings.get()).tenantServiceRequestsEnabled).toBe(false);
    expect(document.siteName).toBe('M-STYLE');
  });
});
