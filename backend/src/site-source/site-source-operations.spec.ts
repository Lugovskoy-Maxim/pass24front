import { SiteSourceService } from './site-source.service';
import { AdminController } from '../admin/admin.controller';

describe('legacy manual testing after operations cutover', () => {
  const service = (state: any) => {
    const value = Object.create(SiteSourceService.prototype);
    value.settings = {
      db: { collection: () => ({ findOne: async () => state }) },
    };
    value.connect = jest.fn();
    return value as SiteSourceService;
  };

  it.each(['paused', 'pass'])(
    'refuses MySQL access in %s mode',
    async (mode) => {
      const source = service({ mode });
      await expect(source.prepareManualTestingData([], true)).rejects.toThrow(
        'отключён',
      );
      expect((source as any).connect).not.toHaveBeenCalled();
    },
  );

  it('does not allow archived MySQL writes even if the mode was reset after opening', async () => {
    await expect(
      service({
        mode: 'mstyle',
        ever_opened: true,
      }).assertLegacyOperationsWritable(),
    ).rejects.toThrow('отключён');
    await expect(
      service({ mode: 'mstyle' }).assertLegacyOperationsWritable(),
    ).resolves.toBeUndefined();
  });

  it.each([
    'prepareIntegrationManualTesting',
    'resetIntegrationManualTesting',
  ] as const)(
    '%s refuses before changing canonical test profiles',
    async (method) => {
      const controller = Object.create(AdminController.prototype);
      controller.siteSourceService = service({ mode: 'pass' });
      controller.siteSettingsService = {
        getMstyleManualTestingSettings: jest.fn(),
      };
      controller.mstyleManualTestingService = { prepare: jest.fn() };
      await expect(
        controller[method]({ user: { role: 'admin' } }),
      ).rejects.toThrow('отключён');
      expect(
        controller.mstyleManualTestingService.prepare,
      ).not.toHaveBeenCalled();
      expect(
        controller.siteSettingsService.getMstyleManualTestingSettings,
      ).not.toHaveBeenCalled();
    },
  );
});
