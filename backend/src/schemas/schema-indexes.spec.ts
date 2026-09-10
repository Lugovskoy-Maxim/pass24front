import {
  MstyleDeletionRequestSchema,
  MstyleIdentitySchema,
  MstyleMembershipSchema,
  MstyleSnapshotBindingSchema,
} from '../integrations/mstyle-v2/mstyle-v2.schemas';
import { UserSchema } from './user.schema';

function duplicateIndexNames(schema: { indexes: () => Array<[Record<string, unknown>]> }) {
  const seen = new Set<string>();
  const duplicates = new Set<string>();

  for (const [keys] of schema.indexes()) {
    const name = JSON.stringify(keys);
    if (seen.has(name)) duplicates.add(name);
    seen.add(name);
  }

  return [...duplicates];
}

describe('Mongoose schema indexes', () => {
  it.each([
    ['User', UserSchema],
    ['MstyleIdentity', MstyleIdentitySchema],
    ['MstyleMembership', MstyleMembershipSchema],
    ['MstyleSnapshotBinding', MstyleSnapshotBindingSchema],
    ['MstyleDeletionRequest', MstyleDeletionRequestSchema],
  ])('%s does not declare an index twice', (_name, schema) => {
    expect(duplicateIndexNames(schema)).toEqual([]);
  });

  it('excludes legacy string operation references from the structured unique index', () => {
    const index = MstyleSnapshotBindingSchema.indexes().find(
      ([, options]) => options.name === 'one_snapshot_per_operation',
    );

    expect(index?.[1]).toMatchObject({
      unique: true,
      partialFilterExpression: {
        'operationRef.operationId': { $type: 'string' },
      },
    });
  });

  it('uses a MongoDB 4.4-compatible uniqueness rule for open deletion requests', () => {
    const index = MstyleDeletionRequestSchema.indexes().find(
      ([, options]) =>
        options.name === 'one_open_deletion_request_per_profile',
    );

    expect(index).toEqual([
      { profileId: 1 },
      expect.objectContaining({
        unique: true,
        partialFilterExpression: { completedAt: { $exists: false } },
      }),
    ]);
  });
});
