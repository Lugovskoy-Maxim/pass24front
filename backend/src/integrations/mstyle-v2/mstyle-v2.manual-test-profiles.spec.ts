import {
  findManualTestIdentity,
  MANUAL_TEST_GUEST_CONTACTS,
  MANUAL_TEST_PROFILES,
} from './mstyle-v2.manual-test-profiles';

describe('manual test profiles', () => {
  it('uses unique contacts reserved for manual testing', () => {
    const identities = MANUAL_TEST_PROFILES.flatMap((profile) => [
      profile.owner,
      ...profile.employees,
      ...profile.employeeCandidates,
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

  it('provides valid birth dates for every manual employee identity', () => {
    const employees = MANUAL_TEST_PROFILES.flatMap((profile) => [
      ...profile.employees,
      ...profile.employeeCandidates,
    ]);
    expect(employees.length).toBeGreaterThan(0);
    for (const employee of employees) {
      expect(employee.birthDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(Number.isNaN(Date.parse(`${employee.birthDate}T00:00:00Z`))).toBe(
        false,
      );
    }
  });

  it('keeps guest delivery contacts separate from resident fixtures', () => {
    const residentPhones = new Set(
      MANUAL_TEST_PROFILES.flatMap((profile) => [
        profile.owner,
        ...profile.employees,
        ...profile.employeeCandidates,
      ]).map((identity) => identity.phone),
    );
    expect(MANUAL_TEST_GUEST_CONTACTS).toHaveLength(3);
    for (const guest of MANUAL_TEST_GUEST_CONTACTS) {
      expect(guest.phone).toMatch(/^\+79990005\d{3}$/);
      expect(residentPhones.has(guest.phone)).toBe(false);
      expect(findManualTestIdentity('phone', guest.phone)?.key).toBe(guest.key);
    }
    expect(findManualTestIdentity('email', 'ninzak@ya.ru')).toBeUndefined();
  });

  it('keeps a dedicated editable company fixture', () => {
    const editable = MANUAL_TEST_PROFILES.filter(
      (profile) => profile.editPolicy === 'self_service',
    );
    expect(editable.map((profile) => profile.key)).toEqual(['romashka']);
    expect(editable[0].type).toBe('company');
  });

  it('covers active, expired and employee-limit scenarios', () => {
    const roga = MANUAL_TEST_PROFILES.find(
      (profile) => profile.key === 'roga-i-kopyta',
    );
    const romashka = MANUAL_TEST_PROFILES.find(
      (profile) => profile.key === 'romashka',
    );
    const ip = MANUAL_TEST_PROFILES.find(
      (profile) => profile.key === 'ip-testov',
    );

    expect(roga?.scenario.office?.externalId).toMatch(/^tf-room:\d+$/);
    expect(roga?.scenario.office?.resourceId).toMatch(
      /^[a-z][a-z0-9]{1,7}_[A-Za-z0-9_-]{16,}$/,
    );
    expect(roga?.scenario.balanceMinutes).toBeGreaterThan(0);
    expect(roga?.scenario.employeeBalanceMinutes).toBe(0);
    expect(romashka?.employeeCandidates).toHaveLength(3);
    expect(romashka?.employeeLimit).toBe(2);
    expect(ip?.scenario.expiresOffsetDays).toBeLessThan(0);
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
