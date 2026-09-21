import { MstyleIdentityService } from './mstyle-v2.identities';
import { safeIdentity, safeProfile } from './mstyle-v2.present';
import {
  canonicalPrivateValues,
  mergeResidentValuesPreservingLegacy,
  requiredResidentFields,
} from './mstyle-v2.private-values';

function identityService(overrides: Record<string, any> = {}) {
  const dependencies = {
    events: { emit: jest.fn().mockResolvedValue('evt_1') },
    users: { findById: jest.fn() },
    identities: { findOne: jest.fn() },
    profiles: {},
    memberships: { findOne: jest.fn() },
    contacts: {},
    offices: {},
    ...overrides,
  };
  const service = new MstyleIdentityService(
    {} as any,
    dependencies.events as any,
    dependencies.users as any,
    dependencies.identities as any,
    dependencies.profiles as any,
    dependencies.memberships as any,
    dependencies.contacts as any,
    dependencies.offices as any,
  );
  return { service, dependencies };
}

describe('Канонические данные человека для Mstyle', () => {
  test('PF-01 переносит структурированное имя User в существующую identity', async () => {
    const { service } = identityService();
    jest.spyOn(service, 'syncContact').mockResolvedValue(null);
    const identity: any = {
      subject: 'usr_01',
      name: { lastName: 'Old', firstName: 'Name', middleName: null },
      displayName: 'Badge name',
      revision: 3,
      contextRevision: 4,
      save: jest.fn().mockResolvedValue(undefined),
    };
    await (service as any).syncIdentityProjectionFromUser(
      {
        lastName: 'Иванов',
        firstName: 'Иван',
        middleName: 'Иванович',
        displayName: 'Badge name',
        emailVerified: true,
      },
      identity,
    );
    expect(identity.name).toEqual({
      lastName: 'Иванов',
      firstName: 'Иван',
      middleName: 'Иванович',
    });
    expect(identity.revision).toBe(4);
    expect(identity.contextRevision).toBe(5);
  });

  test('PF-02 записывает изменение имени R-07 в native User', async () => {
    const user: any = { save: jest.fn().mockResolvedValue(undefined) };
    const { service, dependencies } = identityService({
      users: { findById: jest.fn().mockResolvedValue(user) },
    });
    await service.syncNativePersonFromIdentityPatch(
      { userId: 'native_1' } as any,
      { name: { lastName: 'Петров', firstName: 'Пётр', middleName: null } },
    );
    expect(user).toMatchObject({
      lastName: 'Петров',
      firstName: 'Пётр',
      fullName: 'Петров Пётр',
    });
    expect(dependencies.users.findById).toHaveBeenCalledWith('native_1');
    expect(user.save).toHaveBeenCalledTimes(1);
  });

  test('PF-03 сохраняет независимость displayName от структурированного имени', () => {
    const result = safeIdentity(
      {
        subject: 'usr_01',
        identityStatus: 'active',
        authVersion: 1,
        revision: 1,
        displayName: 'Badge',
        name: { lastName: 'Иванов', firstName: 'Иван', middleName: null },
      } as any,
      true,
    );
    expect(result.displayName).toBe('Badge');
    expect(result.name).toEqual({
      lastName: 'Иванов',
      firstName: 'Иван',
      middleName: null,
    });
  });

  test('PF-04 проецирует компанию без изменения смысла companyShortName', () => {
    const result = safeProfile(
      {
        profileId: 'prf_01',
        type: 'company',
        legalForm: 'ooo',
        status: 'active',
        label: 'Label',
        companyName: 'ООО Полное',
        companyShortName: 'Короткое',
        revision: 1,
        memberPolicy: {},
        officeIds: [],
        membershipSetRevision: 1,
        assignmentSetRevision: 1,
      } as any,
      undefined,
      true,
    );
    expect(result.companyName).toBe('ООО Полное');
    expect(result.companyShortName).toBe('Короткое');
  });

  test('PF-05 сохраняет независимость company.fullName от User.company', () => {
    const values = canonicalPrivateValues(
      { company: { fullName: 'Юридическое имя' } },
      'company',
      'ooo',
    );
    expect(values).toEqual({ company: { fullName: 'Юридическое имя' } });
  });

  test('PF-06 сохраняет старые имена при записи канонических privateData', () => {
    const stored = mergeResidentValuesPreservingLegacy(
      {
        birthDate: '1990-01-02',
        displayName: 'Legacy name',
        passport: { fullName: 'Legacy passport name', birthDate: '1990-01-02' },
      },
      { individual: { inn: '123456789012' } },
      'individual',
    );
    expect(stored.birthDate).toBe('1990-01-02');
    expect(stored.displayName).toBe('Legacy name');
    expect(stored.passport).toEqual({
      fullName: 'Legacy passport name',
      birthDate: '1990-01-02',
    });
    expect((stored.individual as any).inn).toBe('123456789012');
  });

  test('PF-07 не требует passport.fullName для физического лица', () => {
    expect(requiredResidentFields('individual')).toEqual([
      'individual.birthDate',
    ]);
    expect(() =>
      mergeResidentValuesPreservingLegacy(
        {},
        {
          individual: {
            birthDate: '1990-01-02',
            passport: { number: '1234 567890' },
          },
        },
        'individual',
      ),
    ).not.toThrow();
  });

  test('PF-08 получает персональные поля сотрудника из его identity', () => {
    const result = safeIdentity(
      {
        subject: 'usr_employee',
        identityStatus: 'active',
        authVersion: 1,
        revision: 1,
        displayName: 'Employee badge',
        name: {
          lastName: 'Сотрудников',
          firstName: 'Сергей',
          middleName: null,
        },
        birthDate: '1988-08-18',
      } as any,
      true,
    );
    expect(result.name.lastName).toBe('Сотрудников');
    expect(result.birthDate).toBe('1988-08-18');
  });

  test('PF-09 переносит native birthDate в существующую identity', async () => {
    const { service } = identityService();
    jest.spyOn(service, 'syncContact').mockResolvedValue(null);
    const identity: any = {
      subject: 'usr_01',
      name: { lastName: null, firstName: null, middleName: null },
      displayName: '',
      revision: 1,
      contextRevision: 1,
      save: jest.fn().mockResolvedValue(undefined),
    };
    await (service as any).syncIdentityProjectionFromUser(
      { birthDate: '1984-02-29', emailVerified: false },
      identity,
    );
    expect(identity.birthDate).toBe('1984-02-29');
  });

  test('подтверждённый контакт Mstyle сначала записывается в native User', async () => {
    const user: any = {
      email: 'old@example.test',
      emailVerified: false,
      save: jest.fn().mockResolvedValue(undefined),
    };
    const { service } = identityService({
      users: { findById: jest.fn().mockResolvedValue(user) },
    });
    await service.syncNativeContactFromIdentityVerification(
      { userId: 'native_1' } as any,
      'email',
      'new@example.test',
    );
    expect(user.email).toBe('new@example.test');
    expect(user.emailVerified).toBe(true);
    expect(user.save).toHaveBeenCalledTimes(1);
  });

  test('PF-10 обновляет native company без изменения companyShortName', async () => {
    const user: any = {
      company: 'Old company',
      companyShortName: 'Keep me',
      save: jest.fn().mockResolvedValue(undefined),
    };
    const { service } = identityService({
      memberships: {
        findOne: jest.fn().mockResolvedValue({ subject: 'usr_owner' }),
      },
      identities: {
        findOne: jest.fn().mockResolvedValue({ userId: 'native_owner' }),
      },
      users: { findById: jest.fn().mockResolvedValue(user) },
    });
    await service.updateNativeCompanyForProfile('prf_01', 'New company');
    expect(user.company).toBe('New company');
    expect(user.companyShortName).toBe('Keep me');
  });

  test('без явного запроса форма ответа для старого Mstyle не меняется', () => {
    const identity = safeIdentity({
      subject: 'usr_01',
      identityStatus: 'active',
      authVersion: 1,
      revision: 1,
      displayName: 'Name',
      name: {},
      birthDate: '1990-01-01',
    } as any);
    const profile = safeProfile({
      profileId: 'prf_01',
      type: 'company',
      status: 'active',
      label: 'Label',
      companyName: 'Company',
      revision: 1,
      memberPolicy: {},
      officeIds: [],
      membershipSetRevision: 1,
      assignmentSetRevision: 1,
    } as any);
    expect(identity).not.toHaveProperty('birthDate');
    expect(profile).not.toHaveProperty('companyName');
  });
});
