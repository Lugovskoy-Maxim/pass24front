import { Transform } from 'class-transformer';

/** Пустые строки → undefined, чтобы @IsOptional() не пропускал валидацию @IsEmail(). */
export function EmptyToUndefined() {
  return Transform(({ value }) => {
    if (value === null || value === undefined) return undefined;
    if (typeof value === 'string' && value.trim() === '') return undefined;
    return typeof value === 'string' ? value.trim() : value;
  });
}