import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { VerifyCodeDto } from './mstyle-v2.dto';

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
