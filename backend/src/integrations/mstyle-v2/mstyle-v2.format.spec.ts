import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ContactChallengeDto, PatchAssignmentsDto } from './mstyle-v2.dto';
import {
  canonicalPrivateValues,
  normalizeResidentInput,
} from './mstyle-v2.private-values';
import { publicResponse } from './mstyle-v2.public-response';
import { publicSnapshotId, snapshotQuery } from './mstyle-v2.ids';

describe('Mstyle contract format compatibility', () => {
  const options = { whitelist: true, forbidNonWhitelisted: true };
  it.each([
    { contactType: 'email' },
    { contactType: 'phone' },
    { type: 'email' },
    { contactType: 'email', type: 'email' },
  ])('accepts contact discriminator %j', async (fields) => {
    expect(
      await validate(
        plainToInstance(ContactChallengeDto, {
          schemaVersion: '2.0',
          value: 'local@example.test',
          ...fields,
        }),
        options,
      ),
    ).toEqual([]);
  });
  it.each([
    {},
    { contactType: null },
    { type: null },
    { contactType: 'fax' },
    { contactType: 'email', type: 'phone' },
    { contactType: 'email', type: null },
    { contactType: null, type: 'email' },
    { contactType: 'email', unknown: 'x' },
  ])(
    'rejects missing, conflicting or unknown discriminator %j',
    async (fields) => {
      expect(
        await validate(
          plainToInstance(ContactChallengeDto, {
            schemaVersion: '2.0',
            value: 'local@example.test',
            ...fields,
          }),
          options,
        ),
      ).not.toEqual([]);
    },
  );
  it.each(['active', 'revoked', 'inactive'])(
    'accepts assignment status %s',
    async (status) => {
      expect(
        await validate(
          plainToInstance(PatchAssignmentsDto, {
            schemaVersion: '2.0',
            assignments: [
              {
                purpose: 'primary',
                subject: 'usr_test',
                contactId: 'ict_test',
                status,
              },
            ],
          }),
          options,
        ),
      ).toEqual([]);
    },
  );
  it('normalizes the complete Mstyle passport form and preserves other person fields', () => {
    const passport = {
      fullName: 'Local Person',
      number: '1234 567890',
      gender: '',
      birthDate: '1990-01-01',
      departmentCode: '123-456',
      issuedDate: '2010-01-01',
      issuedBy: 'Test office',
    };
    const input = {
      passport,
      birthDate: '1990-01-01',
      inn: '',
      registrationAddress: 'Test address',
      bank: { name: '' },
    };
    const before = JSON.stringify(input);
    expect(normalizeResidentInput(input, 'individual')).toEqual({
      individual: {
        passport,
        birthDate: '1990-01-01',
        inn: '',
        registrationAddress: 'Test address',
      },
      bank: { name: '' },
    });
    expect(JSON.stringify(input)).toBe(before);
    expect(canonicalPrivateValues(input, 'individual').individual).toEqual(
      normalizeResidentInput(input, 'individual').individual,
    );
  });
  it.each([null, [], 'bad', { unexpected: 'x' }, { fullName: 'Different' }])(
    'rejects invalid or conflicting passport %j',
    (passport) => {
      expect(() =>
        normalizeResidentInput(
          { passport, individual: { passport: { fullName: 'Original' } } },
          'individual',
        ),
      ).toThrow();
    },
  );
  it('keeps canonical and flat legacy private input compatible', () => {
    expect(
      normalizeResidentInput(
        { documentNumber: '1234', fullName: 'Local Person' },
        'individual',
      ),
    ).toEqual({
      individual: { passport: { number: '1234', fullName: 'Local Person' } },
    });
    expect(
      normalizeResidentInput(
        {
          individual: { passport: { fullName: 'Same' } },
          passport: { fullName: 'Same' },
        },
        'individual',
      ),
    ).toEqual({ individual: { passport: { fullName: 'Same' } } });
  });
  it('projects cached assignments, snapshots and events without editing signed or user data', async () => {
    const value = {
      items: [
        { assignmentId: 'cas_123', status: 'inactive', contactId: 'cnt_123' },
      ],
      snapshotId: 'snp_123',
      partyType: 'resident_profile',
      values: { snapshotId: 'snp_user_value', status: 'inactive' },
      contentDigest: { value: 'unchanged' },
      operationRef: { operationId: 'snp_user_value' },
      event: {
        profileId: 'prf_123',
        aggregate: { type: 'resident_snapshot', id: 'snp_123', revision: 1 },
        payload: { snapshotId: 'snp_123' },
      },
    };
    const before = JSON.stringify(value);
    const result: any = await publicResponse(value, async () => undefined);
    expect(result.items).toEqual([
      { assignmentId: 'pca_123', status: 'revoked', contactId: 'ict_123' },
    ]);
    expect(result.snapshotId).toBe('rps_123');
    expect(result.event.aggregate.id).toBe('rps_123');
    expect(result.event.payload.snapshotId).toBe('rps_123');
    expect(result.values).toEqual(value.values);
    expect(result.contentDigest).toEqual(value.contentDigest);
    expect(result.operationRef).toEqual(value.operationRef);
    expect(JSON.stringify(value)).toBe(before);
  });
  it('resolves a cached binding by stored snapshot party and fails for unknown references', async () => {
    expect(
      await publicResponse(
        { snapshotId: 'snp_123' },
        async () => 'guest_party',
      ),
    ).toEqual({ snapshotId: 'gps_123' });
    await expect(
      publicResponse({ snapshotId: 'snp_missing' }, async () => undefined),
    ).rejects.toThrow();
  });
  it('constrains typed snapshot aliases and preserves internal references', () => {
    expect(publicSnapshotId('snp_123', 'resident_profile')).toBe('rps_123');
    expect(publicSnapshotId('snp_123', 'guest_party')).toBe('gps_123');
    expect(snapshotQuery('rps_123')).toEqual({
      snapshotId: { $in: ['rps_123', 'snp_123'] },
      partyType: 'resident_profile',
    });
    expect(snapshotQuery('gps_123')).toEqual({
      snapshotId: { $in: ['gps_123', 'snp_123'] },
      partyType: 'guest_party',
    });
    expect(snapshotQuery('snp_123')).toEqual({
      snapshotId: { $in: ['snp_123', 'snp_123'] },
    });
  });
});
