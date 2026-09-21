/* eslint-disable @typescript-eslint/no-unsafe-argument */
import { MstyleDirectoryService } from './mstyle-v2.directory.service';

describe('R-01 resident context identity ETag', () => {
  it('returns the current identity revision as ETag for a later R-07 update', async () => {
    const memberships = {
      find: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue([]),
      }),
    };
    const grants = {
      find: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue([]),
      }),
    };

    const service = new MstyleDirectoryService(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      memberships as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      grants as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    jest.spyOn(service as any, 'requireIdentity').mockResolvedValue({
      subject: 'usr_01TESTIDENTITY',
      identityStatus: 'active',
      authVersion: 3,
      revision: 7,
      contextRevision: 11,
      displayName: 'Test Resident',
      name: {
        lastName: 'Resident',
        firstName: 'Test',
        middleName: null,
      },
      birthDate: null,
      email: undefined,
      phone: undefined,
    });
    jest.spyOn(service as any, 'contactMasks').mockResolvedValue([]);

    const result = await service.getContext('usr_01TESTIDENTITY');

    expect(result.status).toBe(200);
    expect(result.headers.ETag).toBe('"identity-7"');
    expect((result.body as any).contextRevision).toBe(11);
    expect((result.body as any).subject).toBe('usr_01TESTIDENTITY');
  });
});
