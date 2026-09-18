import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { PatchMemberPolicyDto, VerifyCodeDto } from './mstyle-v2.dto';

describe('Mstyle v2 VerifyCodeDto', () => {
  const input = (code: string) =>
    plainToInstance(VerifyCodeDto, {
      schemaVersion: '2.0',
      code,
      context: {
        ipAddress: '192.0.2.10',
        userAgent: 'Mstyle test',
        locale: 'ru-RU',
      },
    });

  it('accepts exactly four digits', async () => {
    await expect(validate(input('1234'))).resolves.toHaveLength(0);
  });

  it.each(['123456', '123', '12a4', ' 1234 '])(
    'rejects invalid code %p',
    async (code) => {
      const errors = await validate(input(code));
      expect(errors.some((error) => error.property === 'code')).toBe(true);
    },
  );
});
describe('Mstyle v2 resident-hours reset day', () => {
  const policy = (residentHoursMonthlyResetDay: number) =>
    plainToInstance(PatchMemberPolicyDto, { residentHoursMonthlyResetDay });

  it.each([1, 15, 31])('accepts reset day %p', async (day) => {
    await expect(validate(policy(day))).resolves.toHaveLength(0);
  });

  it.each([0, 32, 1.5])('rejects invalid reset day %p', async (day) => {
    const errors = await validate(policy(day));
    expect(
      errors.some((error) => error.property === 'residentHoursMonthlyResetDay'),
    ).toBe(true);
  });
});
