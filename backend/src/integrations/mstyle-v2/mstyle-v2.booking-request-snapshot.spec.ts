import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { randomBytes } from 'crypto';
import { MstylePrivateDataService } from './mstyle-v2.private-data.service';
import { ResidentCreateSnapshotDto, CreateSnapshotDto } from './mstyle-v2.dto';
import { decryptJson, encryptJson } from './mstyle-v2.crypto';

function fixture() {
  const secret = randomBytes(32).toString('hex');
  const profile = {
    profileId: 'prf_test',
    type: 'individual',
    legalForm: null,
    status: 'active',
    revision: 7,
    privateDataRevision: null,
    privateDataComplete: false,
  };
  const revisions = {
    profile: 7,
    profileContactAssignments: { phone: 2, email: null },
    contactIdentity: 14,
    identityContacts: { phone: 2, email: null },
    privateData: null,
  };
  const selected: any = {
    phone: {
      contact: { valueEnc: encryptJson(secret, '+70000000000') },
      identity: { displayName: 'Synthetic resident' },
    },
    email: null,
    sourceRevisions: {
      profileContactAssignments: revisions.profileContactAssignments,
      contactIdentity: 14,
      identityContacts: revisions.identityContacts,
    },
  };
  const snapshots = { create: jest.fn(async (value) => value) };
  const events = { emit: jest.fn(async () => 'evt_test') };
  const service = new MstylePrivateDataService(
    { piiSecret: () => secret } as any,
    events as any,
    { findOne: jest.fn(async () => profile) } as any,
    { findOne: jest.fn(async () => null) } as any,
    snapshots as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    { select: jest.fn(async () => selected) } as any,
    {} as any,
  );
  const dto: ResidentCreateSnapshotDto = {
    schemaVersion: '2.0',
    snapshotKind: 'booking_request_snapshot',
    contactPurpose: 'primary',
    expectedSourceRevisions: revisions,
  };
  return {
    secret,
    profile,
    revisions,
    selected,
    snapshots,
    events,
    service,
    dto,
  };
}

describe('resident booking without private questionnaire', () => {
  it('accepts explicit null private revision but rejects omitted and malformed revisions', async () => {
    const { dto } = fixture();
    expect(
      await validate(plainToInstance(ResidentCreateSnapshotDto, dto)),
    ).toEqual([]);
    for (const value of [undefined, 0, -1, '1']) {
      const invalid = {
        ...dto,
        expectedSourceRevisions: {
          ...dto.expectedSourceRevisions,
          privateData: value,
        },
      };
      expect(
        (await validate(plainToInstance(ResidentCreateSnapshotDto, invalid)))
          .length,
      ).toBeGreaterThan(0);
    }
    const guest = {
      ...dto,
      expectedSourceRevisions: {
        guestParty: 1,
        guestContacts: { phone: 1, email: null },
        privateData: null,
      },
    };
    expect(
      (await validate(plainToInstance(CreateSnapshotDto, guest))).length,
    ).toBeGreaterThan(0);
  });

  it('creates an immutable request snapshot with verified contacts and no fabricated private data', async () => {
    const f = fixture();
    const result: any = await f.service.snapshotResident('prf_test', f.dto);
    expect(result.status).toBe(201);
    expect(result.body.sourceRevisions).toEqual(f.revisions);
    expect(f.snapshots.create).toHaveBeenCalledTimes(1);
    const saved = f.snapshots.create.mock.calls[0][0];
    const payload: any = decryptJson(f.secret, saved.payloadEnc);
    expect(payload.contacts.phone).toBe('+70000000000');
    expect(payload.values.individual?.birthDate).toBeUndefined();
    expect(f.profile.privateDataRevision).toBeNull();
    expect(f.profile.privateDataComplete).toBe(false);
  });

  it('still requires data for a legal snapshot and reports the missing field', async () => {
    const f = fixture();
    await expect(
      f.service.snapshotResident('prf_test', {
        ...f.dto,
        snapshotKind: 'booking_legal_snapshot',
      }),
    ).rejects.toMatchObject({
      problemCode: 'PRIVATE_DATA_REQUIRED',
      errors: [{ field: 'individual.birthDate', code: 'required' }],
    });
    expect(f.snapshots.create).not.toHaveBeenCalled();
  });

  it('rejects missing verified contacts even for request snapshots', async () => {
    const f = fixture();
    f.selected.phone = null;
    await expect(
      f.service.snapshotResident('prf_test', f.dto),
    ).rejects.toMatchObject({ problemCode: 'CONFLICT' });
    expect(f.snapshots.create).not.toHaveBeenCalled();
  });

  it('rejects a stale profile revision before creating any snapshot', async () => {
    const f = fixture();
    f.dto.expectedSourceRevisions = { ...f.revisions, profile: 6 };
    await expect(
      f.service.snapshotResident('prf_test', f.dto),
    ).rejects.toMatchObject({ problemCode: 'PRECONDITION_FAILED' });
    expect(f.snapshots.create).not.toHaveBeenCalled();
    expect(f.events.emit).not.toHaveBeenCalled();
  });
});
