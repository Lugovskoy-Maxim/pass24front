import { Pass } from './api';

/** Нужно ли фиксировать выход гостя (режим с подтверждением выхода). */
export function passRequiresCheckout(pass: Pick<Pass, 'requireCheckout'>): boolean {
  return pass.requireCheckout !== false;
}

/** Показывать ли блок «Ход визита» (только при режиме с выходом). */
export function passShowsVisitTimeline(pass: Pick<Pass, 'requireCheckout'>): boolean {
  return passRequiresCheckout(pass);
}