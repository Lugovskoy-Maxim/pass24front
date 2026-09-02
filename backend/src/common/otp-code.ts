import { randomFillSync } from 'crypto';

/** Единая длина OTP для email / локальных SMS / Telegram (не Mobile ID). */
export const OTP_CODE_LENGTH = 4;

/**
 * Криптостойкий числовой OTP фиксированной длины.
 * Mobile ID (SMS Aero) генерирует код сам — эту функцию для него не использовать.
 */
export function generateOtpCode(length: number = OTP_CODE_LENGTH): string {
  if (!Number.isInteger(length) || length < 4 || length > 8) {
    throw new Error('OTP length must be an integer from 4 to 8');
  }
  const bytes = Buffer.allocUnsafe(4);
  randomFillSync(bytes);
  const num = bytes.readUInt32BE(0) % 10 ** length;
  return String(num).padStart(length, '0');
}

export function otpCodePattern(length: number = OTP_CODE_LENGTH): RegExp {
  return new RegExp(`^\\d{${length}}$`);
}
