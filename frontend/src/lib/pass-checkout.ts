import { Pass } from './api';

/** Нужно ли фиксировать выход гостя (режим с подтверждением выхода). */
export function passRequiresCheckout(pass: Pick<Pass, 'requireCheckout'>): boolean {
  return pass.requireCheckout !== false;
}