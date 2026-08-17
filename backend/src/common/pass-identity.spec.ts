import {
  applyUserIdentityDefaults,
  defaultProfileType,
  deriveIdentityStatus,
  identityView,
  normalizeLegalForm,
  resolveEmployeeLimit,
  shouldBumpAuthVersion,
  userAdaptPatch,
} from './pass-identity';

describe('pass-identity', () => {
  it('derives status from operational flags', () => {
    expect(deriveIdentityStatus({ isBlocked: true })).toBe('blocked');
    expect(deriveIdentityStatus({ parentTenantId: 'x', isActive: false })).toBe(
      'disabled',
    );
    expect(deriveIdentityStatus({ invitePending: true })).toBe('invited');
    expect(deriveIdentityStatus({ role: 'tenant', isActive: false })).toBe(
      'invited',
    );
    expect(deriveIdentityStatus({ isActive: true })).toBe('active');
  });

  it('defaults profile type and legal form', () => {
    expect(defaultProfileType({ company: 'ООО Ромашка' })).toBe('company');
    expect(defaultProfileType({})).toBe('individual');
    expect(normalizeLegalForm('individual', 'ooo')).toBe(null);
    expect(normalizeLegalForm('company', null)).toBe('ooo');
    expect(normalizeLegalForm('company', 'ip')).toBe('ip');
  });

  it('uses system employee cap when limit empty', () => {
    expect(resolveEmployeeLimit({})).toBe(3);
    expect(resolveEmployeeLimit({ employeeLimit: 10 })).toBe(10);
  });

  it('bumps authVersion only on block or employee disable', () => {
    expect(
      shouldBumpAuthVersion({ isBlocked: false }, { isBlocked: true }),
    ).toBe(true);
    expect(
      shouldBumpAuthVersion(
        { isActive: true, parentTenantId: 'x' },
        { isActive: false, parentTenantId: 'x' },
      ),
    ).toBe(true);
    expect(
      shouldBumpAuthVersion({ isBlocked: false }, { isBlocked: false }),
    ).toBe(false);
  });

  it('assigns passSubject once', () => {
    const first = applyUserIdentityDefaults({ fullName: 'Иванов Иван' });
    expect(first.passSubject).toMatch(/^usr_/);
    const again = applyUserIdentityDefaults({
      passSubject: first.passSubject,
      fullName: 'Иванов Иван',
    });
    expect(again.passSubject).toBe(first.passSubject);
  });

  it('userAdaptPatch fills holes and keeps subject', () => {
    const first = userAdaptPatch({
      fullName: 'Сидоров Сидор',
      company: 'ООО Тест',
      isActive: true,
    });
    expect(first?.passSubject).toMatch(/^usr_/);
    expect(first?.profileType).toBe('company');
    expect(first?.legalForm).toBe('ooo');
    expect(first?.identityStatus).toBe('active');
    expect(first?.authVersion).toBe(1);
    expect(first?.displayName).toBe('Сидоров Сидор');

    const again = userAdaptPatch({
      passSubject: 'usr_KEEP',
      profileType: 'company',
      legalForm: 'ip',
      identityStatus: 'active',
      authVersion: 3,
      displayName: 'Сидоров Сидор',
      privateDataComplete: false,
      isActive: true,
    });
    expect(again).toBeNull();

    const blocked = userAdaptPatch({
      passSubject: 'usr_KEEP',
      profileType: 'individual',
      legalForm: null,
      identityStatus: 'active',
      authVersion: 1,
      displayName: 'X',
      privateDataComplete: false,
      isBlocked: true,
    });
    expect(blocked).toEqual({ identityStatus: 'blocked' });
  });

  it('identityView never drops name fields for old users', () => {
    const view = identityView({
      fullName: 'Петров Пётр',
      company: 'Тест',
    });
    expect(view.passSubject).toBeNull();
    expect(view.identityStatus).toBe('active');
    expect(view.profileType).toBe('company');
    expect(view.legalForm).toBe('ooo');
    expect(view.displayName).toBe('Петров Пётр');
  });
});
