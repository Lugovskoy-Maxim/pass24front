import { MANUAL_TEST_PROFILES } from './mstyle-v2.manual-test-profiles';

describe('manual test profiles', () => {
  it('uses unique contacts reserved for manual testing', () => {
    const identities = MANUAL_TEST_PROFILES.flatMap((profile) => [
      profile.owner,
      ...profile.employees,
    ]);
    expect(new Set(identities.map((item) => item.email)).size).toBe(
      identities.length,
    );
    expect(new Set(identities.map((item) => item.phone)).size).toBe(
      identities.length,
    );
    for (const identity of identities) {
      expect(identity.email).toMatch(/@manual\.pass\.mstyle\.ru$/);
      expect(identity.phone).toMatch(/^\+7999000\d{4}$/);
    }
  });

  it('contains checksum-valid identifiers', () => {
    for (const profile of MANUAL_TEST_PROFILES) {
      const data = profile.privateData as Record<string, any>;
      if (profile.legalForm === 'ooo') {
        expect(validInn10(data.company.inn)).toBe(true);
        expect(validOgrn(data.company.ogrn)).toBe(true);
      } else if (profile.legalForm === 'ip') {
        expect(validInn12(data.entrepreneur.inn)).toBe(true);
        expect(validOgrnip(data.entrepreneur.ogrnip)).toBe(true);
      } else {
        expect(validInn12(data.individual.inn)).toBe(true);
      }
    }
  });
});

function validInn10(value: string) {
  if (!/^\d{10}$/.test(value)) return false;
  return digit(value.slice(0, 9), [2, 4, 10, 3, 5, 9, 4, 6, 8]) === +value[9];
}

function validInn12(value: string) {
  if (!/^\d{12}$/.test(value)) return false;
  return (
    digit(value.slice(0, 10), [7, 2, 4, 10, 3, 5, 9, 4, 6, 8]) === +value[10] &&
    digit(value.slice(0, 11), [3, 7, 2, 4, 10, 3, 5, 9, 4, 6, 8]) === +value[11]
  );
}

function digit(value: string, weights: number[]) {
  return (
    ([...value].reduce(
      (sum, item, index) => sum + Number(item) * weights[index],
      0,
    ) %
      11) %
    10
  );
}

function validOgrn(value: string) {
  return (
    /^\d{13}$/.test(value) &&
    Number((BigInt(value.slice(0, 12)) % 11n) % 10n) === +value[12]
  );
}

function validOgrnip(value: string) {
  return (
    /^\d{15}$/.test(value) &&
    Number((BigInt(value.slice(0, 14)) % 13n) % 10n) === +value[14]
  );
}
