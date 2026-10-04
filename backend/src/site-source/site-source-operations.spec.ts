import { SiteSourceService } from './site-source.service';
import { AdminController } from '../admin/admin.controller';

describe('legacy manual testing after operations cutover', () => {
  it('keeps manual service settings through repeated MySQL category synchronization', async () => {
    const source = Object.create(SiteSourceService.prototype);
    const manual = {
      values: { publicIp: '1.2.3.4' },
      visibleFields: ['packageName'],
      serviceOverrides: [],
    };
    const office = {
      number: '401',
      officeFormat: 'standard',
      serviceDetails: manual,
      serviceRevision: 7,
      save: jest.fn(),
    };
    await source.applySourceToOffice(office, {
      officeFormat: 'standard+',
      isActive: true,
    });
    await source.applySourceToOffice(office, {
      officeFormat: 'standard_plus',
      isActive: true,
    });
    expect(office.officeFormat).toBe('standard_plus');
    expect(office.serviceDetails).toBe(manual);
    expect(office.serviceRevision).toBe(7);
  });
  it('preserves authored settings on merge and refuses conflicting settings', async () => {
    const source = Object.create(SiteSourceService.prototype);
    const manual = {
      values: { packageName: 'VIP' },
      visibleFields: ['packageName'],
      serviceOverrides: [],
    };
    const keep = { serviceRevision: 0, save: jest.fn() };
    const drop = { serviceRevision: 3, serviceDetails: manual };
    await source.mergeOfficeDocs(keep, drop);
    expect((keep as any).serviceDetails).toBe(manual);
    expect(keep.serviceRevision).toBe(3);
    await expect(
      source.mergeOfficeDocs(keep, {
        serviceRevision: 4,
        serviceDetails: { ...manual, visibleFields: [] },
      }),
    ).rejects.toThrow('различаются');
  });
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
