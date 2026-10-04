import {
  detailsInput,
  effectiveRule,
  normalizeOfficeCategory,
  ruleInput,
  serviceInput,
  visibleOfficeValues,
} from './office-services.rules';
const rule = {
  categoryCode: 'standard',
  show: true,
  orderable: true,
  mode: 'paid',
  priceMinor: 180000,
  unit: 'hour',
  freeMinutes: 0,
  conditions: 'По записи',
};
describe('manual office service rules', () => {
  it.each(['standard+', 'standard +', 'standard-plus', 'стандарт+'])(
    'normalizes %s without changing another category',
    (code) => expect(normalizeOfficeCategory(code)).toBe('standard_plus'),
  );
  it('keeps an unfilled category unavailable instead of inheriting prices', () => {
    expect(
      effectiveRule(
        { _id: 'service', rules: [rule] },
        { officeFormat: 'standard_plus' },
      ),
    ).toBeUndefined();
    expect(
      effectiveRule(
        { _id: 'service', rules: [rule] },
        { officeFormat: 'standard' },
      )?.priceMinor,
    ).toBe(180000);
  });
  it('applies only an override for the exact office category', () => {
    const office = {
      officeFormat: 'vip',
      serviceDetails: {
        serviceOverrides: [
          {
            ...rule,
            serviceId: 'service',
            categoryCode: 'vip',
            mode: 'included',
          },
        ],
      },
    };
    expect(effectiveRule({ _id: 'service', rules: [rule] }, office)?.mode).toBe(
      'included',
    );
  });
  it('excludes unpublished and unknown fields from the tenant response', () => {
    expect(
      visibleOfficeValues({
        values: { packageName: 'VIP', publicIp: '1.2.3.4', password: 'secret' },
        visibleFields: ['packageName', 'password'],
      }),
    ).toEqual({ packageName: 'VIP' });
  });
  it('rejects missing prices and invalid network values', () => {
    expect(() => ruleInput({ ...rule, priceMinor: null })).toThrow();
    expect(() => ruleInput({ ...rule, priceMinor: 12.5 })).toThrow();
    expect(() => detailsInput({ values: { localIp: 'not-an-ip' } })).toThrow();
    expect(() =>
      detailsInput({ values: { dns: '8.8.8.8, invalid' } }),
    ).toThrow();
    expect(() => detailsInput({ values: { downloadMbps: '-1' } })).toThrow();
  });
  it('allows manual unknown-cost and included services without a fabricated price', () => {
    expect(
      ruleInput({ ...rule, mode: 'request', priceMinor: null }).priceMinor,
    ).toBeNull();
    expect(
      ruleInput({ ...rule, mode: 'included', priceMinor: null }).mode,
    ).toBe('included');
  });
  it('requires hourly units for bookings and a positive manual free limit', () => {
    expect(() =>
      serviceInput({
        name: 'Переговорная',
        active: true,
        rules: [{ ...rule, unit: 'order' }],
        bookingRoomIds: [1],
      }),
    ).toThrow();
    expect(() =>
      ruleInput({ ...rule, mode: 'quota', freeMinutes: 0 }),
    ).toThrow();
    expect(
      ruleInput({ ...rule, mode: 'quota', freeMinutes: 120 }).freeMinutes,
    ).toBe(120);
  });
});
