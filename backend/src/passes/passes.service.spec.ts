import { PassesService } from './passes.service';

describe('pass number allocation', () => {
  function setup() {
    const create = jest.fn();
    const service: any = Object.create(PassesService.prototype);
    service.passModel = { create };
    return { service, create };
  }

  it('uses a larger numeric namespace compatible with ticket numbers', () => {
    const { service } = setup();
    expect(service.generatePassNumber()).toMatch(/^Pass-\d{4}-\d{12}$/);
  });

  it('retries a colliding number without changing visitor data', async () => {
    const { service, create } = setup();
    const collision = { code: 11000, keyPattern: { passNumber: 1 } };
    const doc = { passNumber: 'Pass-2026-100000000002' };
    create.mockRejectedValueOnce(collision).mockResolvedValueOnce(doc);
    jest
      .spyOn(service, 'generatePassNumber')
      .mockReturnValueOnce('Pass-2026-100000000001')
      .mockReturnValueOnce(doc.passNumber);
    const data = { visitorName: 'Visitor', office: '101' };
    await expect(service.createWithUniquePassNumber(data)).resolves.toBe(doc);
    expect(create.mock.calls.map(([row]) => row)).toEqual([
      { ...data, passNumber: 'Pass-2026-100000000001' },
      { ...data, passNumber: doc.passNumber },
    ]);
  });

  it.each([
    { code: 11000, keyPattern: { _id: 1 } },
    { code: 11000, keyPattern: { passNumber: 1, office: 1 } },
    { code: 11000 },
    new Error('database unavailable'),
  ])('propagates unrelated database errors: %p', async (error) => {
    const { service, create } = setup();
    create.mockRejectedValue(error);
    await expect(service.createWithUniquePassNumber({})).rejects.toBe(error);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('bounds retries when number allocation keeps failing', async () => {
    const { service, create } = setup();
    const error = { code: 11000, keyPattern: { passNumber: 1 } };
    create.mockRejectedValue(error);
    await expect(service.createWithUniquePassNumber({})).rejects.toBe(error);
    expect(create).toHaveBeenCalledTimes(5);
  });
});
