import { MstyleIdentityService } from './mstyle-v2.identities';
import {
  canonicalPrivateValues,
  getPath,
  mergeObjects,
  normalizeResidentInput,
  requiredResidentFields,
  validateResidentValues,
} from './mstyle-v2.private-values';

function makeService() {
  const events = { emit: jest.fn(async () => undefined) };
  const users = { findById: jest.fn() };
  const identities = { findOne: jest.fn(), updateOne: jest.fn() };
  const profiles = { findOne: jest.fn() };
  const memberships = {
    findOne: jest.fn(),
    find: jest.fn(() => ({
      select: jest.fn(() => ({
        lean: jest.fn(async () => []),
      })),
    })),
  };
  const contacts = { findOne: jest.fn(), create: jest.fn() };
  const offices = { find: jest.fn() };

  const service = new MstyleIdentityService(
    {} as any,
    events as any,
    users as any,
    identities as any,
    profiles as any,
    memberships as any,
    contacts as any,
    offices as any,
  );

  jest
    .spyOn(service as any, 'syncContact')
    .mockImplementation(async () => undefined);

  return {
    service,
    events,
    users,
    identities,
    profiles,
    memberships,
    contacts,
    offices,
  };
}

describe('Mstyle resident-data canonical round trip', () => {
  it('refreshes structured name, displayName and birthDate from native User into an existing identity', async () => {
    const { service, events } = makeService();
    const identity = {
      subject: 'sub_owner',
      name: {
        lastName: 'Старый',
        firstName: 'Резидент',
        middleName: null,
      },
      birthDate: '1980-01-01',
      displayName: 'Старое отображаемое имя',
      login: 'owner',
      phone: '+79990000000',
      email: 'old@example.test',
      revision: 7,
      contextRevision: 11,
      save: jest.fn(async () => undefined),
    };
    const user = {
      lastName: 'Иванов',
      firstName: 'Иван',
      middleName: 'Иванович',
      birthDate: '1990-05-06',
      displayName: 'Публичное имя, отличное от ФИО',
      fullName: 'Иванов Иван Иванович',
      username: 'owner',
      phone: '+79991112233',
      email: 'OWNER@EXAMPLE.TEST',
      emailVerified: true,
    };

    await (service as any).syncIdentityProjectionFromUser(user, identity);

    expect(identity.name).toEqual({
      lastName: 'Иванов',
      firstName: 'Иван',
      middleName: 'Иванович',
    });
    expect(identity.birthDate).toBe('1990-05-06');
    expect(identity.displayName).toBe('Публичное имя, отличное от ФИО');
    expect(identity.revision).toBe(8);
    expect(identity.contextRevision).toBe(12);
    expect(identity.save).toHaveBeenCalledTimes(1);
    expect(events.emit).toHaveBeenCalledTimes(1);
  });

  it('writes an identity person patch back to the linked native User without deriving resident-data from displayName', async () => {
    const { service, users } = makeService();
    const nativeUser: any = {
      lastName: 'Старый',
      firstName: 'Пользователь',
      middleName: '',
      fullName: 'Старый Пользователь',
      displayName: 'Старый alias',
      birthDate: '1981-01-01',
      save: jest.fn(async () => undefined),
      set: jest.fn(function (this: any, key: string, value: unknown) {
        this[key] = value;
      }),
    };
    users.findById.mockResolvedValue(nativeUser);

    await service.syncNativePersonFromIdentityPatch(
      { userId: 'user-owner' } as any,
      {
        name: {
          lastName: 'Петров',
          firstName: 'Пётр',
          middleName: 'Петрович',
        },
        birthDate: '1992-02-03',
        displayName: 'Отдельный display name',
      },
    );

    expect(nativeUser.lastName).toBe('Петров');
    expect(nativeUser.firstName).toBe('Пётр');
    expect(nativeUser.middleName).toBe('Петрович');
    expect(nativeUser.fullName).toBe('Петров Пётр Петрович');
    expect(nativeUser.birthDate).toBe('1992-02-03');
    expect(nativeUser.displayName).toBe('Отдельный display name');
    expect(nativeUser.save).toHaveBeenCalledTimes(1);
  });

  it('keeps employee birthDate person-local even when the employee belongs to an owner profile', async () => {
    const { service } = makeService();
    const identity: any = {
      subject: 'sub_employee',
      name: { lastName: null, firstName: null, middleName: null },
      birthDate: undefined,
      displayName: '',
      login: undefined,
      phone: undefined,
      email: undefined,
      revision: 1,
      contextRevision: 1,
      save: jest.fn(async () => undefined),
    };
    const employeeUser = {
      parentTenantId: 'user-owner',
      lastName: 'Сотрудников',
      firstName: 'Сергей',
      middleName: 'Сергеевич',
      birthDate: '1988-08-18',
      displayName: 'Сотрудник',
      username: 'employee',
      phone: '+79990001002',
      email: 'employee@example.test',
      emailVerified: true,
    };

    await (service as any).syncIdentityProjectionFromUser(
      employeeUser,
      identity,
    );

    expect(identity.birthDate).toBe('1988-08-18');
    expect(identity.name).toEqual({
      lastName: 'Сотрудников',
      firstName: 'Сергей',
      middleName: 'Сергеевич',
    });
  });

  it('updates canonical native company name without overwriting companyShortName', async () => {
    const { service, users, identities, memberships } = makeService();
    const nativeUser: any = {
      company: 'ООО Старое',
      companyShortName: 'Короткое имя остаётся',
      save: jest.fn(async () => undefined),
      set: jest.fn(function (this: any, key: string, value: unknown) {
        this[key] = value;
      }),
    };

    memberships.findOne.mockResolvedValue({
      subject: 'sub_owner',
      profileId: 'prf_owner',
      role: 'owner',
      status: 'active',
    });
    identities.findOne.mockResolvedValue({
      subject: 'sub_owner',
      userId: 'user-owner',
    });
    users.findById.mockResolvedValue(nativeUser);

    await service.updateNativeCompanyForProfile(
      'prf_owner',
      'ООО Новое каноническое название',
    );

    expect(nativeUser.company).toBe('ООО Новое каноническое название');
    expect(nativeUser.companyShortName).toBe('Короткое имя остаётся');
    expect(nativeUser.save).toHaveBeenCalledTimes(1);
  });

  it('projects native User.company to profile.companyName without rewriting companyShortName', async () => {
    const { service, profiles, memberships } = makeService();
    const profile: any = {
      profileId: 'prf_owner',
      officeIds: [],
      companyName: 'ООО Старое',
      companyShortName: 'Короткое имя',
      revision: 4,
      save: jest.fn(async () => undefined),
    };

    memberships.findOne.mockResolvedValue({
      subject: 'sub_owner',
      profileId: 'prf_owner',
      status: 'active',
    });
    profiles.findOne.mockResolvedValue(profile);
    jest.spyOn(service as any, 'officeExternalIds').mockResolvedValue([]);

    await (service as any).syncProfileOfficeIds(
      {
        _id: 'user-owner',
        company: 'ООО Каноническое',
      },
      { subject: 'sub_owner' },
    );

    expect(profile.companyName).toBe('ООО Каноническое');
    expect(profile.companyShortName).toBe('Короткое имя');
    expect(profile.revision).toBe(5);
    expect(profile.save).toHaveBeenCalledTimes(1);
  });

  it('preserves legacy individual passport values on a partial canonical patch', () => {
    const current = normalizeResidentInput(
      {
        individual: {
          birthDate: '1990-01-01',
          passport: {
            fullName: 'Иванов Иван Иванович',
            birthDate: '1990-01-01',
            number: '1234567890',
            issuedBy: 'ОВД',
          },
        },
      },
      'individual',
    );
    const patch = normalizeResidentInput(
      {
        individual: {
          registrationAddress: 'Калининград',
        },
      },
      'individual',
    );

    const merged = validateResidentValues(
      mergeObjects(current, patch),
      'individual',
    );

    expect(getPath(merged, 'individual.passport.fullName')).toBe(
      'Иванов Иван Иванович',
    );
    expect(getPath(merged, 'individual.passport.birthDate')).toBe('1990-01-01');
    expect(getPath(merged, 'individual.passport.number')).toBe('1234567890');
    expect(getPath(merged, 'individual.registrationAddress')).toBe(
      'Калининград',
    );
  });

  it('preserves representative legacy data on a partial company patch', () => {
    const current = normalizeResidentInput(
      {
        company: {
          fullName: 'Общество с ограниченной ответственностью «Тест»',
          inn: '3900000000',
          ogrn: '1234567890123',
        },
        representative: {
          fullName: 'Иванов Иван Иванович',
          birthDate: '1980-01-02',
        },
      },
      'company',
      'ooo',
    );
    const patch = normalizeResidentInput(
      {
        company: {
          actualAddress: 'Калининград',
        },
      },
      'company',
      'ooo',
    );

    const merged = validateResidentValues(
      mergeObjects(current, patch),
      'company',
      'ooo',
    );

    expect(getPath(merged, 'representative.fullName')).toBe(
      'Иванов Иван Иванович',
    );
    expect(getPath(merged, 'representative.birthDate')).toBe('1980-01-02');
    expect(getPath(merged, 'company.actualAddress')).toBe('Калининград');
  });

  it('keeps canonical completion rules distinct for individual, IP and ООО', () => {
    expect(requiredResidentFields('individual')).toEqual([
      'individual.birthDate',
    ]);
    expect(requiredResidentFields('company', 'ip')).toEqual([
      'entrepreneur.inn',
      'entrepreneur.ogrnip',
    ]);
    expect(requiredResidentFields('company', 'ooo')).toEqual([
      'company.fullName',
      'company.inn',
      'company.ogrn',
    ]);

    expect(() =>
      validateResidentValues(
        { individual: { birthDate: '1991-01-01' } },
        'individual',
      ),
    ).not.toThrow();

    expect(() =>
      validateResidentValues(
        {
          entrepreneur: {
            inn: '123456789012',
            ogrnip: '123456789012345',
          },
        },
        'company',
        'ip',
      ),
    ).not.toThrow();

    expect(() =>
      validateResidentValues(
        {
          company: {
            fullName: 'ООО «Тест»',
            inn: '3900000000',
            ogrn: '1234567890123',
          },
        },
        'company',
        'ooo',
      ),
    ).not.toThrow();
  });

  it('projects legacy companyFullName into canonical company.fullName without deleting source data', () => {
    const source = {
      companyFullName: 'Общество с ограниченной ответственностью «Легаси»',
      inn: '3900000000',
      ogrn: '1234567890123',
    };

    const canonical = canonicalPrivateValues(source, 'company', 'ooo');

    expect(getPath(canonical, 'company.fullName')).toBe(
      'Общество с ограниченной ответственностью «Легаси»',
    );
    expect(source.companyFullName).toBe(
      'Общество с ограниченной ответственностью «Легаси»',
    );
  });
});
