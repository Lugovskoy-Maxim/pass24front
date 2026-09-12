const CONTROL_WEIGHTS = [7, 1, 3] as const;

export function isValidRussianBik(value: unknown): value is string {
  return typeof value === 'string' && /^\d{9}$/.test(value);
}

export function isValidRussianSettlementAccount(
  bik: unknown,
  accountNumber: unknown,
): boolean {
  if (!isValidRussianBik(bik) || !isTwentyDigitAccount(accountNumber)) {
    return false;
  }
  return hasValidControlKey(`${bik.slice(-3)}${accountNumber}`);
}

export function isValidRussianCorrespondentAccount(
  bik: unknown,
  accountNumber: unknown,
): boolean {
  if (!isValidRussianBik(bik) || !isTwentyDigitAccount(accountNumber)) {
    return false;
  }
  return hasValidControlKey(`0${bik.slice(4, 6)}${accountNumber}`);
}

function isTwentyDigitAccount(value: unknown): value is string {
  return typeof value === 'string' && /^\d{20}$/.test(value);
}

function hasValidControlKey(value: string): boolean {
  const sum = [...value].reduce(
    (total, digit, index) =>
      total + Number(digit) * CONTROL_WEIGHTS[index % CONTROL_WEIGHTS.length],
    0,
  );
  return sum % 10 === 0;
}
