import { MstyleIdentityService } from './mstyle-v2.identities';

type FakeProfile = {
  profileId: string;
  revision: number;
  resourceOwnerProfileId: string | null;
  officeIds: string[];
  memberPolicy: {
    employeeLimit: number | null;
    residentHoursMonthlyQuotaMin: number;
    residentHoursMonthlyResetDay: number;
  };
  save: jest.Mock<Promise<void>, []>;
};

function makeProfile(
  profileId: string,
  revision: number,
  resourceOwnerProfileId: string | null = null,
  officeIds: string[] = [],
  quota = 0,
  resetDay = 1,
): FakeProfile {
  return {
    profileId,
    revision,
    resourceOwnerProfileId,
    officeIds,
    memberPolicy: {
      employeeLimit: null,
      residentHoursMonthlyQuotaMin: quota,
      residentHoursMonthlyResetDay: resetDay,
    },
    save: jest.fn(async () => undefined),
  };
}

function makeService(allProfiles: FakeProfile[]) {
  const events = { emit: jest.fn(async () => undefined) };
  const identities = { updateOne: jest.fn(async () => undefined) };
  const memberships = {
    find: jest.fn(() => ({
      select: jest.fn(() => ({
        lean: jest.fn(async () => []),
      })),
    })),
  };
  const profiles = {
    find: jest.fn(async (query: any) => {
      if (query?.resourceOwnerProfileId) {
        return allProfiles.filter(
          (profile) =>
            profile.resourceOwnerProfileId === query.resourceOwnerProfileId &&
            profile.profileId !== query?.profileId?.$ne,
        );
      }
      return [];
    }),
    findOne: jest.fn(
      async (query: any) =>
        allProfiles.find((profile) => profile.profileId === query?.profileId) ??
        null,
    ),
    exists: jest.fn(async (query: any) =>
      allProfiles.some(
        (profile) =>
          profile.resourceOwnerProfileId === query?.resourceOwnerProfileId &&
          profile.profileId !== query?.profileId?.$ne,
      )
        ? { _id: 'exists' }
        : null,
    ),
  };
  const offices = {
    find: jest.fn(),
    findOne: jest.fn(),
    updateOne: jest.fn(),
  };

  const service = new MstyleIdentityService(
    {} as any,
    events as any,
    {} as any,
    identities as any,
    profiles as any,
    memberships as any,
    {} as any,
    offices as any,
  );

  return { service, events, identities, memberships, profiles, offices };
}

describe('Mstyle resource hierarchy scenarios', () => {
  it('classifies standalone, primary and secondary profiles', () => {
    const standalone = makeProfile('prf_standalone', 1);
    const primary = makeProfile('prf_primary', 2, 'prf_primary');
    const secondary = makeProfile('prf_secondary', 3, 'prf_primary');
    const { service } = makeService([standalone, primary, secondary]);

    expect((service as any).profileResourceRole(standalone)).toBe('standalone');
    expect((service as any).profileResourceRole(primary)).toBe('primary');
    expect((service as any).profileResourceRole(secondary)).toBe('secondary');
  });

  it('attaches and detaches a secondary without copying its own projected office data', async () => {
    const primary = makeProfile(
      'prf_primary',
      100,
      null,
      ['tf_room:100'],
      600,
      10,
    );
    const secondary = makeProfile(
      'prf_secondary',
      5,
      null,
      ['tf_room:200'],
      120,
      3,
    );
    const allProfiles = [primary, secondary];
    const { service, offices } = makeService(allProfiles);

    jest
      .spyOn(service as any, 'tenantOwnerProfileForUserId')
      .mockImplementation(async (userId: string) => {
        if (userId === 'user-secondary') return secondary;
        throw new Error(`unexpected user: ${userId}`);
      });

    await (service as any).updateResourceRelations(primary, {
      isPrimaryProfile: true,
      secondaryUserIds: ['user-secondary'],
    });

    expect(primary.resourceOwnerProfileId).toBe(primary.profileId);
    expect(secondary.resourceOwnerProfileId).toBe(primary.profileId);
    expect(primary.revision).toBe(101);
    expect(secondary.revision).toBe(6);
    expect(secondary.officeIds).toEqual(['tf_room:200']);
    expect(secondary.memberPolicy.residentHoursMonthlyQuotaMin).toBe(120);
    expect(offices.updateOne).not.toHaveBeenCalled();

    const resolvedOwner = await (service as any).resolveResourceOwnerProfile(
      secondary,
    );
    expect(resolvedOwner.profileId).toBe(primary.profileId);
    expect(resolvedOwner.officeIds).toEqual(['tf_room:100']);
    expect(resolvedOwner.memberPolicy.residentHoursMonthlyQuotaMin).toBe(600);
    expect(resolvedOwner.memberPolicy.residentHoursMonthlyResetDay).toBe(10);

    await (service as any).updateResourceRelations(primary, {
      secondaryUserIds: [],
    });

    expect(secondary.resourceOwnerProfileId).toBeNull();
    expect(secondary.revision).toBe(7);
    expect(secondary.officeIds).toEqual(['tf_room:200']);
  });

  it('rejects self, chain and direct cross-primary attachment', async () => {
    const primaryA = makeProfile('prf_a', 10, 'prf_a');
    const primaryB = makeProfile('prf_b', 20, 'prf_b');
    const secondary = makeProfile('prf_secondary', 5, 'prf_a');
    const childWithChild = makeProfile('prf_chain', 7);
    const grandchild = makeProfile('prf_grandchild', 3, 'prf_chain');
    const allProfiles = [
      primaryA,
      primaryB,
      secondary,
      childWithChild,
      grandchild,
    ];
    const { service } = makeService(allProfiles);

    jest
      .spyOn(service as any, 'tenantOwnerProfileForUserId')
      .mockImplementation(async (userId: string) => {
        if (userId === 'self') return primaryA;
        if (userId === 'primary-b') return primaryB;
        if (userId === 'secondary') return secondary;
        if (userId === 'chain') return childWithChild;
        throw new Error(`unexpected user: ${userId}`);
      });

    await expect(
      (service as any).updateResourceRelations(primaryA, {
        secondaryUserIds: ['self'],
      }),
    ).rejects.toBeDefined();

    await expect(
      (service as any).updateResourceRelations(primaryA, {
        secondaryUserIds: ['primary-b'],
      }),
    ).rejects.toBeDefined();

    await expect(
      (service as any).updateResourceRelations(primaryB, {
        secondaryUserIds: ['secondary'],
      }),
    ).rejects.toBeDefined();

    await expect(
      (service as any).updateResourceRelations(primaryA, {
        secondaryUserIds: ['chain'],
      }),
    ).rejects.toBeDefined();
  });

  it('supports reparent only after detach and keeps revisions profile-local', async () => {
    const primaryA = makeProfile('prf_a', 100, 'prf_a', ['tf_room:1'], 600, 10);
    const primaryB = makeProfile('prf_b', 20, 'prf_b', ['tf_room:2'], 300, 5);
    const secondary = makeProfile('prf_c', 5, 'prf_a', ['tf_room:3'], 90, 2);
    const allProfiles = [primaryA, primaryB, secondary];
    const { service } = makeService(allProfiles);

    jest
      .spyOn(service as any, 'tenantOwnerProfileForUserId')
      .mockImplementation(async (userId: string) => {
        if (userId === 'child') return secondary;
        throw new Error(`unexpected user: ${userId}`);
      });

    await expect(
      (service as any).updateResourceRelations(primaryB, {
        secondaryUserIds: ['child'],
      }),
    ).rejects.toBeDefined();

    await (service as any).updateResourceRelations(primaryA, {
      secondaryUserIds: [],
    });
    expect(secondary.resourceOwnerProfileId).toBeNull();
    expect(secondary.revision).toBe(6);

    await (service as any).updateResourceRelations(primaryB, {
      secondaryUserIds: ['child'],
    });

    expect(secondary.resourceOwnerProfileId).toBe(primaryB.profileId);
    expect(secondary.revision).toBe(7);
    expect(primaryA.revision).toBe(100);
    expect(primaryB.revision).toBe(20);

    const resolvedOwner = await (service as any).resolveResourceOwnerProfile(
      secondary,
    );
    expect(resolvedOwner.profileId).toBe(primaryB.profileId);
    expect(resolvedOwner.revision).toBe(20);
    expect(resolvedOwner.memberPolicy.residentHoursMonthlyQuotaMin).toBe(300);
    expect(resolvedOwner.officeIds).toEqual(['tf_room:2']);
  });

  it('propagates resource projection changes by bumping the child namespace revision only', async () => {
    const primary = makeProfile('prf_a', 100, 'prf_a', ['tf_room:1'], 600, 10);
    const child = makeProfile('prf_c', 5, 'prf_a', ['tf_room:3'], 90, 2);
    const { service, events } = makeService([primary, child]);

    await (service as any).propagateResourceProjectionChange(
      primary.profileId,
      [
        'officeIds',
        'memberPolicy.residentHoursMonthlyQuotaMin',
        'memberPolicy.residentHoursMonthlyResetDay',
      ],
    );

    expect(primary.revision).toBe(100);
    expect(child.revision).toBe(6);
    expect(child.resourceOwnerProfileId).toBe(primary.profileId);
    expect(child.officeIds).toEqual(['tf_room:3']);
    expect(events.emit).toHaveBeenCalledWith(
      expect.objectContaining({
        aggregate: expect.objectContaining({
          id: child.profileId,
          revision: 6,
        }),
        payload: {
          changedFieldCodes: [
            'officeIds',
            'memberPolicy.residentHoursMonthlyQuotaMin',
            'memberPolicy.residentHoursMonthlyResetDay',
          ],
        },
      }),
    );
  });
});
