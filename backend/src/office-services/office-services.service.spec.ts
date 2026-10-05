import { OfficeServicesService } from './office-services.service';

describe('office editor reads legacy service settings', () => {
  const id = '000000000000000000000001';
  const property = '000000000000000000000002';
  function service(serviceDetails?: any) {
    const stored = {
      _id: id,
      property,
      serviceDetails,
      officeFormat: 'standard',
      serviceRevision: 7,
    };
    const offices = { findById: jest.fn(() => ({ lean: async () => stored })) };
    const result = new OfficeServicesService(
      {} as any,
      offices as any,
      {} as any,
      {} as any,
    );
    jest.spyOn(result, 'category').mockResolvedValue(null);
    return { result, stored };
  }
  it.each([undefined, null, {}])(
    'opens an office with empty settings: %p',
    async (details) => {
      const { result, stored } = service(details);
      expect(await result.adminOffice(id, { role: 'admin' })).toMatchObject({
        office: {
          id,
          revision: 7,
          details: { values: {}, visibleFields: [], serviceOverrides: [] },
        },
      });
      expect(stored.serviceDetails).toBe(details);
    },
  );
  it('preserves values in a partial document and keeps absent fields unpublished', async () => {
    const settings = { values: { provider: 'Провайдер', publicIp: '1.2.3.4' } };
    const { result } = service(settings);
    const { office } = await result.adminOffice(id, { role: 'admin' });
    expect(office.details).toEqual({
      values: settings.values,
      visibleFields: [],
      serviceOverrides: [],
    });
    expect(settings).not.toHaveProperty('visibleFields');
  });
  it('preserves visibility, individual prices and revision without a database rewrite', async () => {
    const settings = {
      values: { packageName: 'VIP' },
      visibleFields: ['packageName'],
      serviceOverrides: [
        {
          serviceId: 'service-1',
          categoryCode: 'standard',
          mode: 'paid',
          priceMinor: 150000,
        },
      ],
    };
    const { result, stored } = service(settings);
    const { office } = await result.adminOffice(id, { role: 'admin' });
    expect(office.details).toEqual(settings);
    expect(office.revision).toBe(7);
    expect(stored.serviceDetails).toBe(settings);
  });
});
