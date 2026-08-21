import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Query,
  Req,
  SetMetadata,
  UseFilters,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { MSTYLE_PRIVATE_PREFIX } from './mstyle-v2.constants';
import { MstyleAuthService } from './mstyle-v2.auth.service';
import { MstyleDirectoryService } from './mstyle-v2.directory.service';
import { MstyleEventsService } from './mstyle-v2.events';
import { MstyleGuestsService } from './mstyle-v2.guests.service';
import { MstyleIdempotencyService } from './mstyle-v2.idempotency';
import { MstylePrivateDataService } from './mstyle-v2.private-data.service';
import { MstyleMockResponseInterceptor } from './mstyle-v2.mock.interceptor';
import {
  ChangeDecisionDto,
  ChangeRequestDto,
  ClaimGuestDto,
  CodeChallengeDto,
  ConfirmBookingDto,
  ConsentAcceptDto,
  ContactChallengeDto,
  ContactVerifyDto,
  CreateGuestDto,
  CreateMembershipDto,
  DeletionRequestDto,
  LifecycleDto,
  OnboardingDto,
  OwnerTransferDto,
  PasswordVerifyDto,
  PatchAssignmentsDto,
  PatchIdentityDto,
  PatchMembershipDto,
  PatchPrivateDataDto,
  PatchProfileDto,
  RevealDto,
  SearchGuestsDto,
  SearchProfilesDto,
  VerifyCodeDto,
  BindSnapshotDto,
} from './mstyle-v2.dto';
import {
  MstyleEnabledGuard,
  MstyleProblemFilter,
  MstyleRequestGuard,
  MstyleResultInterceptor,
  MstyleServiceTokenGuard,
  REQUIRE_IDEMPOTENCY,
  REQUIRE_REQUEST_ID,
  type MstyleRequest,
} from './mstyle-v2.http';
import { MstyleResult } from './mstyle-v2.problem';

const Idempotent = () => SetMetadata(REQUIRE_IDEMPOTENCY, true);
const NeedRequestId = () => SetMetadata(REQUIRE_REQUEST_ID, true);

@ApiExcludeController()
@UseFilters(MstyleProblemFilter)
@UseGuards(MstyleEnabledGuard, MstyleServiceTokenGuard, MstyleRequestGuard)
@UseInterceptors(MstyleResultInterceptor, MstyleMockResponseInterceptor)
@Controller(MSTYLE_PRIVATE_PREFIX)
export class MstylePrivateController {
  constructor(
    private readonly auth: MstyleAuthService,
    private readonly directory: MstyleDirectoryService,
    private readonly guests: MstyleGuestsService,
    private readonly privateData: MstylePrivateDataService,
    private readonly events: MstyleEventsService,
    private readonly idempotency: MstyleIdempotencyService,
  ) {}

  @Post('auth/residents/password-verify')
  @NeedRequestId()
  @Idempotent()
  async passwordVerify(
    @Body() dto: PasswordVerifyDto,
    @Req() req: MstyleRequest,
  ) {
    return this.withIdempotency(
      req,
      'POST',
      '/auth/residents/password:verify',
      dto,
      () =>
        this.auth.verifyPassword(
          dto,
          req.mstyleClientId!,
          clientIp(req, dto.context.ipAddress),
        ),
      'IDEMPOTENCY_REPLAY_EXPIRED',
      true,
    );
  }

  @Post('auth/residents/code-challenges')
  @NeedRequestId()
  @Idempotent()
  async startChallenge(
    @Body() dto: CodeChallengeDto,
    @Req() req: MstyleRequest,
  ) {
    return this.withIdempotency(
      req,
      'POST',
      '/auth/residents/code-challenges',
      {
        ...dto,
        context: { ...dto.context, password: undefined, code: undefined },
      },
      () =>
        this.auth.startCodeChallenge(
          dto,
          req.mstyleClientId!,
          clientIp(req, dto.context.ipAddress),
        ),
    );
  }

  @Get('auth/residents/code-challenges/:challengeId')
  @NeedRequestId()
  getChallenge(
    @Param('challengeId') challengeId: string,
    @Req() req: MstyleRequest,
  ) {
    return this.auth.getChallenge(challengeId, req.mstyleClientId!);
  }

  @Post('auth/residents/code-challenges/:challengeId/resend')
  @NeedRequestId()
  @Idempotent()
  async resend(
    @Param('challengeId') challengeId: string,
    @Req() req: MstyleRequest,
  ) {
    return this.withIdempotency(
      req,
      'POST',
      `/auth/residents/code-challenges/${challengeId}/resend`,
      {},
      () => this.auth.resend(challengeId, req.mstyleClientId!, clientIp(req)),
    );
  }

  @Post('auth/residents/code-challenges/:challengeId/verify')
  @NeedRequestId()
  @Idempotent()
  async verify(
    @Param('challengeId') challengeId: string,
    @Body() dto: VerifyCodeDto,
    @Req() req: MstyleRequest,
  ) {
    const key = String(req.headers['idempotency-key'] || '');
    const replay = await this.idempotency.replayOrThrow({
      clientId: req.mstyleClientId!,
      idempotencyKey: key,
      method: 'POST',
      route: `/auth/residents/code-challenges/${challengeId}/verify`,
      body: { schemaVersion: dto.schemaVersion, context: dto.context },
      replayExpiredCode: 'CHALLENGE_CONSUMED',
    });
    if (replay) return replay;
    if (key) {
      await this.auth.rejectConsumedNewKey(challengeId, req.mstyleClientId!);
    }
    const result = await this.auth.verifyCode(
      challengeId,
      dto,
      req.mstyleClientId!,
      clientIp(req, dto.context.ipAddress),
    );
    await this.idempotency.save({
      clientId: req.mstyleClientId!,
      idempotencyKey: key,
      method: 'POST',
      route: `/auth/residents/code-challenges/${challengeId}/verify`,
      body: { schemaVersion: dto.schemaVersion, context: dto.context },
      result,
      replayWindow: true,
    });
    return result;
  }

  @Get('residents/:subject/context')
  getContext(@Param('subject') subject: string) {
    return this.directory.getContext(subject);
  }

  @Patch('residents/:subject/identity')
  patchIdentity(
    @Param('subject') subject: string,
    @Body() dto: PatchIdentityDto,
    @Headers('if-match') ifMatch?: string,
  ) {
    return this.directory.patchIdentity(subject, dto, ifMatch);
  }

  @Post('residents/:subject/contacts/challenges')
  startContact(
    @Param('subject') subject: string,
    @Body() dto: ContactChallengeDto,
  ) {
    return this.directory.startContactChallenge(subject, dto);
  }

  @Post('residents/:subject/contacts/challenges/:challengeId/verify')
  verifyContact(
    @Param('subject') subject: string,
    @Param('challengeId') challengeId: string,
    @Body() dto: ContactVerifyDto,
  ) {
    return this.directory.verifyContactChallenge(subject, challengeId, dto);
  }

  @Post('residents/:subject/contacts/reveal')
  revealContacts(@Param('subject') subject: string) {
    return this.directory.revealContacts(subject);
  }

  @Get('residents/:subject/consents')
  listConsents(@Param('subject') subject: string) {
    return this.directory.listConsents(subject);
  }

  @Post('residents/:subject/consents/:documentCode/accept')
  acceptConsent(
    @Param('subject') subject: string,
    @Param('documentCode') documentCode: string,
    @Body() dto: ConsentAcceptDto,
  ) {
    return this.directory.acceptConsent(subject, documentCode, dto);
  }

  @Post('residents/:subject/consents/:documentCode/withdraw')
  withdrawConsent(
    @Param('subject') subject: string,
    @Param('documentCode') documentCode: string,
  ) {
    return this.directory.withdrawConsent(subject, documentCode);
  }

  @Get('identities/:subject')
  getIdentity(@Param('subject') subject: string) {
    return this.directory.getIdentity(subject);
  }

  @Get('changes')
  changes(@Query('after') after?: string, @Query('limit') limit?: string) {
    return this.events.list(after, limit ? Number(limit) : 50);
  }

  @Post('resident-onboarding')
  onboard(@Body() dto: OnboardingDto) {
    return this.directory.onboard(dto);
  }

  @Post('resident-profiles/search')
  searchProfiles(@Body() dto: SearchProfilesDto) {
    return this.directory.searchProfiles(dto);
  }

  @Get('resident-profiles/:profileId/memberships')
  memberships(@Param('profileId') profileId: string) {
    return this.directory.listMemberships(profileId);
  }

  @Post('resident-profiles/:profileId/memberships')
  addMembership(
    @Param('profileId') profileId: string,
    @Body() dto: CreateMembershipDto,
  ) {
    return this.directory.addMembership(profileId, dto);
  }

  @Post('resident-profiles/:profileId/owner-transfer')
  transfer(
    @Param('profileId') profileId: string,
    @Body() dto: OwnerTransferDto,
  ) {
    return this.directory.transferOwner(profileId, dto);
  }

  @Get('resident-profiles/:profileId/contact-assignments')
  assignments(@Param('profileId') profileId: string) {
    return this.directory.listAssignments(profileId);
  }

  @Patch('resident-profiles/:profileId/contact-assignments')
  replaceAssignments(
    @Param('profileId') profileId: string,
    @Body() dto: PatchAssignmentsDto,
  ) {
    return this.directory.replaceAssignments(profileId, dto);
  }

  @Get('resident-profiles/:profileId/private-data/status')
  privateStatus(@Param('profileId') profileId: string) {
    return this.privateData.residentStatus(profileId);
  }

  @Post('resident-profiles/:profileId/private-data/reveal')
  revealPrivate(@Param('profileId') profileId: string, @Body() dto: RevealDto) {
    return this.privateData.revealResident(profileId, dto);
  }

  @Patch('resident-profiles/:profileId/private-data')
  patchPrivate(
    @Param('profileId') profileId: string,
    @Body() dto: PatchPrivateDataDto,
  ) {
    return this.privateData.patchResident(profileId, dto);
  }

  @Post('resident-profiles/:profileId/private-data/snapshots')
  snapshotResident(@Param('profileId') profileId: string) {
    return this.privateData.snapshotResident(profileId);
  }

  @Post('resident-profiles/:profileId/contacts/reveal')
  revealProfileContacts(@Param('profileId') profileId: string) {
    return this.privateData.revealProfileContacts(profileId);
  }

  @Get('resident-profiles/:profileId/physical-access')
  access(@Param('profileId') profileId: string) {
    return this.directory.physicalAccess(profileId);
  }

  @Get('resident-profiles/:profileId/change-requests/current')
  currentChange(@Param('profileId') profileId: string) {
    return this.directory.currentChangeRequest(profileId);
  }

  @Post('resident-profiles/:profileId/change-requests')
  createChange(
    @Param('profileId') profileId: string,
    @Body() dto: ChangeRequestDto,
  ) {
    return this.directory.createChangeRequest(profileId, dto);
  }

  @Post('resident-profiles/:profileId/lifecycle-transitions')
  lifecycle(
    @Param('profileId') profileId: string,
    @Body() dto: LifecycleDto,
    @Headers('if-match') ifMatch?: string,
  ) {
    return this.directory.lifecycle(profileId, dto, ifMatch);
  }

  @Post('resident-profiles/:profileId/deletion-requests')
  deletion(
    @Param('profileId') profileId: string,
    @Body() dto: DeletionRequestDto,
  ) {
    return this.directory.requestDeletion(profileId, dto);
  }

  @Get('resident-profiles/:profileId')
  getProfile(@Param('profileId') profileId: string) {
    return this.directory.getProfile(profileId);
  }

  @Patch('resident-profiles/:profileId')
  patchProfile(
    @Param('profileId') profileId: string,
    @Body() dto: PatchProfileDto,
    @Headers('if-match') ifMatch?: string,
  ) {
    return this.directory.patchProfile(profileId, dto, ifMatch);
  }

  @Patch('resident-memberships/:membershipId')
  patchMembership(
    @Param('membershipId') membershipId: string,
    @Body() dto: PatchMembershipDto,
  ) {
    return this.directory.patchMembership(membershipId, dto);
  }

  @Post('resident-memberships/:membershipId/revoke')
  revokeMembership(@Param('membershipId') membershipId: string) {
    return this.directory.revokeMembership(membershipId);
  }

  @Post('resident-profile-change-requests/:changeRequestId/decisions')
  decide(
    @Param('changeRequestId') changeRequestId: string,
    @Body() dto: ChangeDecisionDto,
  ) {
    return this.directory.decideChange(changeRequestId, dto);
  }

  @Post('resident-profile-change-requests/:changeRequestId/cancel')
  cancel(@Param('changeRequestId') changeRequestId: string) {
    return this.directory.cancelChange(changeRequestId);
  }

  @Get('deletion-requests/:deletionRequestId')
  getDeletion(@Param('deletionRequestId') deletionRequestId: string) {
    return this.directory.getDeletion(deletionRequestId);
  }

  @Post('private-data-snapshots/:snapshotId/reveal')
  revealSnapshot(
    @Param('snapshotId') snapshotId: string,
    @Body() dto: RevealDto,
  ) {
    return this.privateData.revealSnapshot(snapshotId, dto);
  }

  @Post('private-data-snapshots/:snapshotId/contacts/reveal')
  revealSnapshotContacts(@Param('snapshotId') snapshotId: string) {
    return this.privateData.revealSnapshotContacts(snapshotId);
  }

  @Post('private-data-snapshots/:snapshotId/operation-bindings')
  bindSnapshot(
    @Param('snapshotId') snapshotId: string,
    @Body() dto: BindSnapshotDto,
  ) {
    return this.privateData.bindSnapshot(snapshotId, dto);
  }

  @Post('guest-parties/search')
  searchGuests(@Body() dto: SearchGuestsDto) {
    return this.guests.search(dto);
  }

  @Post('guest-parties')
  createGuest(@Body() dto: CreateGuestDto) {
    return this.guests.create(dto);
  }

  @Post('guest-parties/:guestPartyId/contact-challenges')
  guestContact(
    @Param('guestPartyId') guestPartyId: string,
    @Body() dto: ContactChallengeDto,
  ) {
    return this.guests.startContact(guestPartyId, dto);
  }

  @Post('guest-parties/:guestPartyId/contact-challenges/:challengeId/verify')
  guestVerify(
    @Param('guestPartyId') guestPartyId: string,
    @Param('challengeId') challengeId: string,
    @Body() dto: ContactVerifyDto,
  ) {
    return this.guests.verifyContact(guestPartyId, challengeId, dto);
  }

  @Get('guest-parties/:guestPartyId/status')
  guestStatus(@Param('guestPartyId') guestPartyId: string) {
    return this.guests.status(guestPartyId);
  }

  @Post('guest-parties/:guestPartyId/contacts/reveal')
  guestRevealContacts(@Param('guestPartyId') guestPartyId: string) {
    return this.privateData.revealGuestContacts(guestPartyId);
  }

  @Get('guest-parties/:guestPartyId/private-data/status')
  guestPrivateStatus(@Param('guestPartyId') guestPartyId: string) {
    return this.privateData.guestStatus(guestPartyId);
  }

  @Post('guest-parties/:guestPartyId/private-data/reveal')
  guestRevealPrivate(
    @Param('guestPartyId') guestPartyId: string,
    @Body() dto: RevealDto,
  ) {
    return this.privateData.revealGuest(guestPartyId, dto);
  }

  @Patch('guest-parties/:guestPartyId/private-data')
  guestPatchPrivate(
    @Param('guestPartyId') guestPartyId: string,
    @Body() dto: PatchPrivateDataDto,
  ) {
    return this.privateData.patchGuest(guestPartyId, dto);
  }

  @Post('guest-parties/:guestPartyId/snapshots')
  guestSnapshot(@Param('guestPartyId') guestPartyId: string) {
    return this.privateData.snapshotGuest(guestPartyId);
  }

  @Post('guest-parties/:guestPartyId/booking-confirmations')
  guestBook(
    @Param('guestPartyId') guestPartyId: string,
    @Body() dto: ConfirmBookingDto,
  ) {
    return this.guests.confirmBooking(guestPartyId, dto);
  }

  @Post('guest-parties/:guestPartyId/claim')
  guestClaim(
    @Param('guestPartyId') guestPartyId: string,
    @Body() dto: ClaimGuestDto,
  ) {
    return this.guests.claim(guestPartyId, dto);
  }

  @Get('guest-parties/:guestPartyId/consents')
  guestConsents(@Param('guestPartyId') guestPartyId: string) {
    return this.guests.listConsents(guestPartyId);
  }

  @Post('guest-parties/:guestPartyId/consents/:documentCode/accept')
  guestAccept(
    @Param('guestPartyId') guestPartyId: string,
    @Param('documentCode') documentCode: string,
    @Body() dto: ConsentAcceptDto,
  ) {
    return this.guests.acceptConsent(guestPartyId, documentCode, dto);
  }

  @Post('guest-parties/:guestPartyId/consents/:documentCode/withdraw')
  guestWithdraw(
    @Param('guestPartyId') guestPartyId: string,
    @Param('documentCode') documentCode: string,
  ) {
    return this.guests.withdrawConsent(guestPartyId, documentCode);
  }

  private async withIdempotency(
    req: MstyleRequest,
    method: string,
    route: string,
    body: unknown,
    run: () => Promise<MstyleResult>,
    replayExpiredCode?: 'IDEMPOTENCY_REPLAY_EXPIRED' | 'CHALLENGE_CONSUMED',
    replayWindow = false,
  ) {
    const key = String(req.headers['idempotency-key'] || '');
    const replay = await this.idempotency.replayOrThrow({
      clientId: req.mstyleClientId!,
      idempotencyKey: key,
      method,
      route,
      body,
      replayExpiredCode,
    });
    if (replay) return replay;
    const result = await run();
    await this.idempotency.save({
      clientId: req.mstyleClientId!,
      idempotencyKey: key,
      method,
      route,
      body,
      result,
      replayWindow,
    });
    return result;
  }
}

function clientIp(req: MstyleRequest, fallback?: string): string {
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0];
  return (
    fallback || forwarded || req.ip || req.socket?.remoteAddress || '0.0.0.0'
  );
}
