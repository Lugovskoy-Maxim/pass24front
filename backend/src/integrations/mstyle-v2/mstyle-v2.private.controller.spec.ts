import 'reflect-metadata';
import { PATH_METADATA } from '@nestjs/common/constants';
import { REQUIRE_IDEMPOTENCY, REQUIRE_REQUEST_ID } from './mstyle-v2.http';
import { MstylePrivateController } from './mstyle-v2.private.controller';

describe('MstylePrivateController metadata', () => {
  it('requires X-Request-ID for every private route by default', () => {
    expect(
      Reflect.getMetadata(REQUIRE_REQUEST_ID, MstylePrivateController),
    ).toBe(true);
  });

  it('serves the canonical PHP password route and the legacy alias', () => {
    expect(
      Reflect.getMetadata(
        PATH_METADATA,
        MstylePrivateController.prototype.passwordVerify,
      ),
    ).toEqual([
      'auth/residents/password:verify',
      'auth/residents/password-verify',
    ]);
  });

  it.each([
    'patchIdentity',
    'startContact',
    'verifyContact',
    'acceptConsent',
    'withdrawConsent',
    'onboard',
    'addMembership',
    'transfer',
    'replaceAssignments',
    'patchPrivate',
    'snapshotResident',
    'createChange',
    'lifecycle',
    'deletion',
    'patchProfile',
    'patchMembership',
    'revokeMembership',
    'decide',
    'cancel',
    'bindSnapshot',
    'createGuest',
    'guestContact',
    'guestVerify',
    'guestPatchPrivate',
    'guestSnapshot',
    'guestBook',
    'guestClaim',
    'guestAccept',
    'guestWithdraw',
  ])('marks %s as idempotent', (methodName) => {
    const handler = MstylePrivateController.prototype[
      methodName as keyof MstylePrivateController
    ] as (...args: unknown[]) => unknown;

    expect(Reflect.getMetadata(REQUIRE_IDEMPOTENCY, handler)).toBe(true);
  });
});
