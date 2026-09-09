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
  ProfileContactsRevealDto,
  ReasonCodeDto,
  SnapshotContactsRevealDto,
  SnapshotRevealDto,
} from './mstyle-v2.dto';
import {
  MstyleEnabledGuard,
  MstyleProblemFilter,
  MstyleRequestGuard,
  MstyleRouteContextGuard,
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
@UseGuards(
  MstyleEnabledGuard,
  MstyleServiceTokenGuard,
  MstyleRequestGuard,
  MstyleRouteContextGuard,
)
@UseInterceptors(MstyleResultInterceptor, MstyleMockResponseInterceptor)
@NeedRequestId()
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

  @Post(['auth/residents/password:verify', 'auth/residents/password-verify'])
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
  @Idempotent()
  patchIdentity(
    @Param('subject') subject: string,
    @Body() dto: PatchIdentityDto,
    @Headers('if-match') ifMatch: string | undefined,
    @Req() req: MstyleRequest,
  ) {
    return this.withIdempotency(
      req,
      'PATCH',
      `/residents/${subject}/identity`,
      { dto, ifMatch },
      () => this.directory.patchIdentity(subject, dto, ifMatch),
    );
  }

  @Post('residents/:subject/contacts/challenges')
  @Idempotent()
  startContact(
    @Param('subject') subject: string,
    @Body() dto: ContactChallengeDto,
    @Req() req: MstyleRequest,
  ) {
    return this.withIdempotency(
      req,
      'POST',
      `/residents/${subject}/contacts/challenges`,
      dto,
      () => this.directory.startContactChallenge(subject, dto),
    );
  }

  @Post('residents/:subject/contacts/challenges/:challengeId/verify')
  @Idempotent()
  verifyContact(
    @Param('subject') subject: string,
    @Param('challengeId') challengeId: string,
    @Body() dto: ContactVerifyDto,
    @Req() req: MstyleRequest,
  ) {
    return this.withIdempotency(
      req,
      'POST',
      `/residents/${subject}/contacts/challenges/${challengeId}/verify`,
      { schemaVersion: dto.schemaVersion },
      () => this.directory.verifyContactChallenge(subject, challengeId, dto),
      'CHALLENGE_CONSUMED',
      true,
    );
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
  @Idempotent()
  acceptConsent(
    @Param('subject') subject: string,
    @Param('documentCode') documentCode: string,
    @Body() dto: ConsentAcceptDto,
    @Req() req: MstyleRequest,
  ) {
    return this.withIdempotency(
      req,
      'POST',
      `/residents/${subject}/consents/${documentCode}/accept`,
      dto,
      () => this.directory.acceptConsent(subject, documentCode, dto),
    );
  }

  @Post('residents/:subject/consents/:documentCode/withdraw')
  @Idempotent()
  withdrawConsent(
    @Param('subject') subject: string,
    @Param('documentCode') documentCode: string,
    @Req() req: MstyleRequest,
  ) {
    return this.withIdempotency(
      req,
      'POST',
      `/residents/${subject}/consents/${documentCode}/withdraw`,
      {},
      () => this.directory.withdrawConsent(subject, documentCode),
    );
  }

  @Get('identities/:subject')
  getIdentity(@Param('subject') subject: string) {
    return this.directory.getIdentity(subject);
  }

  @Get('changes')
  changes(@Query('after') after?: string, @Query('limit') limit?: string) {
    return this.events.list(after, limit ? Number(limit) : 100);
  }

  @Post('resident-onboarding')
  @Idempotent()
  onboard(@Body() dto: OnboardingDto, @Req() req: MstyleRequest) {
    return this.withIdempotency(req, 'POST', '/resident-onboarding', dto, () =>
      this.directory.onboard(dto),
    );
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
  @Idempotent()
  addMembership(
    @Param('profileId') profileId: string,
    @Body() dto: CreateMembershipDto,
    @Req() req: MstyleRequest,
  ) {
    return this.withIdempotency(
      req,
      'POST',
      `/resident-profiles/${profileId}/memberships`,
      dto,
      () => this.directory.addMembership(profileId, dto),
    );
  }

  @Post('resident-profiles/:profileId/owner-transfer')
  @Idempotent()
  transfer(
    @Param('profileId') profileId: string,
    @Body() dto: OwnerTransferDto,
    @Req() req: MstyleRequest,
  ) {
    return this.withIdempotency(
      req,
      'POST',
      `/resident-profiles/${profileId}/owner-transfer`,
      dto,
      () =>
        this.directory.transferOwner(
          profileId,
          dto,
          req.mstyleResidentSubject!,
        ),
    );
  }

  @Get('resident-profiles/:profileId/contact-assignments')
  assignments(@Param('profileId') profileId: string) {
    return this.directory.listAssignments(profileId);
  }

  @Patch('resident-profiles/:profileId/contact-assignments')
  @Idempotent()
  replaceAssignments(
    @Param('profileId') profileId: string,
    @Body() dto: PatchAssignmentsDto,
    @Headers('if-match') ifMatch: string | undefined,
    @Req() req: MstyleRequest,
  ) {
    return this.withIdempotency(
      req,
      'PATCH',
      `/resident-profiles/${profileId}/contact-assignments`,
      { dto, ifMatch },
      () => this.directory.replaceAssignments(profileId, dto, ifMatch),
    );
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
  @Idempotent()
  patchPrivate(
    @Param('profileId') profileId: string,
    @Body() dto: PatchPrivateDataDto,
    @Headers('if-match') ifMatch: string | undefined,
    @Req() req: MstyleRequest,
  ) {
    return this.withIdempotency(
      req,
      'PATCH',
      `/resident-profiles/${profileId}/private-data`,
      { dto, ifMatch },
      () => this.privateData.patchResident(profileId, dto, ifMatch),
    );
  }

  @Post('resident-profiles/:profileId/private-data/snapshots')
  @Idempotent()
  snapshotResident(
    @Param('profileId') profileId: string,
    @Req() req: MstyleRequest,
  ) {
    return this.withIdempotency(
      req,
      'POST',
      `/resident-profiles/${profileId}/private-data/snapshots`,
      {},
      () => this.privateData.snapshotResident(profileId),
    );
  }

  @Post('resident-profiles/:profileId/contacts/reveal')
  revealProfileContacts(
    @Param('profileId') profileId: string,
    @Body() dto: ProfileContactsRevealDto,
    @Req() req: MstyleRequest,
  ) {
    return this.privateData.revealProfileContacts(
      profileId,
      dto,
      req.mstyleResidentSubject,
    );
  }

  @Get('resident-profiles/:profileId/physical-access')
  access(@Param('profileId') profileId: string, @Req() req: MstyleRequest) {
    return this.directory.physicalAccess(profileId, req.mstyleResidentSubject);
  }

  @Get('resident-profiles/:profileId/change-requests/current')
  currentChange(
    @Param('profileId') profileId: string,
    @Req() req: MstyleRequest,
  ) {
    return this.directory.currentChangeRequest(
      profileId,
      req.mstyleResidentSubject!,
    );
  }

  @Post('resident-profiles/:profileId/change-requests')
  @Idempotent()
  createChange(
    @Param('profileId') profileId: string,
    @Body() dto: ChangeRequestDto,
    @Headers('if-match') ifMatch: string | undefined,
    @Req() req: MstyleRequest,
  ) {
    return this.withIdempotency(
      req,
      'POST',
      `/resident-profiles/${profileId}/change-requests`,
      { dto, ifMatch },
      () =>
        this.directory.createChangeRequest(
          profileId,
          dto,
          ifMatch,
          req.mstyleResidentSubject!,
        ),
    );
  }

  @Post('resident-profiles/:profileId/lifecycle-transitions')
  @Idempotent()
  lifecycle(
    @Param('profileId') profileId: string,
    @Body() dto: LifecycleDto,
    @Headers('if-match') ifMatch: string | undefined,
    @Req() req: MstyleRequest,
  ) {
    return this.withIdempotency(
      req,
      'POST',
      `/resident-profiles/${profileId}/lifecycle-transitions`,
      { dto, ifMatch },
      () => this.directory.lifecycle(profileId, dto, ifMatch),
    );
  }

  @Post('resident-profiles/:profileId/deletion-requests')
  @Idempotent()
  deletion(
    @Param('profileId') profileId: string,
    @Body() dto: DeletionRequestDto,
    @Headers('if-match') ifMatch: string | undefined,
    @Req() req: MstyleRequest,
  ) {
    return this.withIdempotency(
      req,
      'POST',
      `/resident-profiles/${profileId}/deletion-requests`,
      { dto, ifMatch },
      () => this.directory.requestDeletion(profileId, dto, ifMatch),
    );
  }

  @Get('resident-profiles/:profileId')
  getProfile(@Param('profileId') profileId: string) {
    return this.directory.getProfile(profileId);
  }

  @Patch('resident-profiles/:profileId')
  @Idempotent()
  patchProfile(
    @Param('profileId') profileId: string,
    @Body() dto: PatchProfileDto,
    @Headers('if-match') ifMatch: string | undefined,
    @Req() req: MstyleRequest,
  ) {
    return this.withIdempotency(
      req,
      'PATCH',
      `/resident-profiles/${profileId}`,
      { dto, ifMatch },
      () => this.directory.patchProfile(profileId, dto, ifMatch),
    );
  }

  @Patch('resident-memberships/:membershipId')
  @Idempotent()
  patchMembership(
    @Param('membershipId') membershipId: string,
    @Body() dto: PatchMembershipDto,
    @Headers('if-match') ifMatch: string | undefined,
    @Req() req: MstyleRequest,
  ) {
    return this.withIdempotency(
      req,
      'PATCH',
      `/resident-memberships/${membershipId}`,
      { dto, ifMatch },
      () =>
        this.directory.patchMembership(
          membershipId,
          dto,
          ifMatch,
          req.mstyleResidentSubject!,
        ),
    );
  }

  @Post('resident-memberships/:membershipId/revoke')
  @Idempotent()
  revokeMembership(
    @Param('membershipId') membershipId: string,
    @Body() dto: ReasonCodeDto,
    @Headers('if-match') ifMatch: string | undefined,
    @Req() req: MstyleRequest,
  ) {
    return this.withIdempotency(
      req,
      'POST',
      `/resident-memberships/${membershipId}/revoke`,
      { dto, ifMatch },
      () =>
        this.directory.revokeMembership(
          membershipId,
          dto,
          ifMatch,
          req.mstyleResidentSubject!,
        ),
    );
  }

  @Post('resident-profile-change-requests/:changeRequestId/decisions')
  @Idempotent()
  decide(
    @Param('changeRequestId') changeRequestId: string,
    @Body() dto: ChangeDecisionDto,
    @Headers('if-match') ifMatch: string | undefined,
    @Req() req: MstyleRequest,
  ) {
    return this.withIdempotency(
      req,
      'POST',
      `/resident-profile-change-requests/${changeRequestId}/decisions`,
      { dto, ifMatch },
      () => this.directory.decideChange(changeRequestId, dto, ifMatch),
    );
  }

  @Post('resident-profile-change-requests/:changeRequestId/cancel')
  @Idempotent()
  cancel(
    @Param('changeRequestId') changeRequestId: string,
    @Body() dto: ReasonCodeDto,
    @Headers('if-match') ifMatch: string | undefined,
    @Req() req: MstyleRequest,
  ) {
    return this.withIdempotency(
      req,
      'POST',
      `/resident-profile-change-requests/${changeRequestId}/cancel`,
      { dto, ifMatch },
      () =>
        this.directory.cancelChange(
          changeRequestId,
          dto,
          ifMatch,
          req.mstyleResidentSubject!,
        ),
    );
  }

  @Get('deletion-requests/:deletionRequestId')
  getDeletion(@Param('deletionRequestId') deletionRequestId: string) {
    return this.directory.getDeletion(deletionRequestId);
  }

  @Post('private-data-snapshots/:snapshotId/reveal')
  revealSnapshot(
    @Param('snapshotId') snapshotId: string,
    @Body() dto: SnapshotRevealDto,
    @Req() req: MstyleRequest,
  ) {
    return this.privateData.revealSnapshot(
      snapshotId,
      dto,
      req.mstyleScopes || [],
    );
  }

  @Post('private-data-snapshots/:snapshotId/contacts/reveal')
  revealSnapshotContacts(
    @Param('snapshotId') snapshotId: string,
    @Body() dto: SnapshotContactsRevealDto,
    @Req() req: MstyleRequest,
  ) {
    return this.privateData.revealSnapshotContacts(
      snapshotId,
      dto,
      req.mstyleScopes || [],
    );
  }

  @Post('private-data-snapshots/:snapshotId/operation-bindings')
  @Idempotent()
  bindSnapshot(
    @Param('snapshotId') snapshotId: string,
    @Body() dto: BindSnapshotDto,
    @Req() req: MstyleRequest,
  ) {
    return this.withIdempotency(
      req,
      'POST',
      `/private-data-snapshots/${snapshotId}/operation-bindings`,
      dto,
      () => this.privateData.bindSnapshot(snapshotId, dto),
    );
  }

  @Post('guest-parties/search')
  searchGuests(@Body() dto: SearchGuestsDto) {
    return this.guests.search(dto);
  }

  @Post('guest-parties')
  @Idempotent()
  createGuest(@Body() dto: CreateGuestDto, @Req() req: MstyleRequest) {
    return this.withIdempotency(req, 'POST', '/guest-parties', dto, () =>
      this.guests.create(dto),
    );
  }

  @Post('guest-parties/:guestPartyId/contact-challenges')
  @Idempotent()
  guestContact(
    @Param('guestPartyId') guestPartyId: string,
    @Body() dto: ContactChallengeDto,
    @Req() req: MstyleRequest,
  ) {
    return this.withIdempotency(
      req,
      'POST',
      `/guest-parties/${guestPartyId}/contact-challenges`,
      dto,
      () => this.guests.startContact(guestPartyId, dto),
    );
  }

  @Post('guest-parties/:guestPartyId/contact-challenges/:challengeId/verify')
  @Idempotent()
  guestVerify(
    @Param('guestPartyId') guestPartyId: string,
    @Param('challengeId') challengeId: string,
    @Body() dto: ContactVerifyDto,
    @Req() req: MstyleRequest,
  ) {
    return this.withIdempotency(
      req,
      'POST',
      `/guest-parties/${guestPartyId}/contact-challenges/${challengeId}/verify`,
      { schemaVersion: dto.schemaVersion },
      () => this.guests.verifyContact(guestPartyId, challengeId, dto),
      'CHALLENGE_CONSUMED',
      true,
    );
  }

  @Get('guest-parties/:guestPartyId/status')
  guestStatus(@Param('guestPartyId') guestPartyId: string) {
    return this.guests.status(guestPartyId);
  }

  @Post('guest-parties/:guestPartyId/contacts/reveal')
  guestRevealContacts(
    @Param('guestPartyId') guestPartyId: string,
    @Body() dto: RevealDto,
  ) {
    return this.privateData.revealGuestContacts(guestPartyId, dto);
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
  @Idempotent()
  guestPatchPrivate(
    @Param('guestPartyId') guestPartyId: string,
    @Body() dto: PatchPrivateDataDto,
    @Headers('if-match') ifMatch: string | undefined,
    @Req() req: MstyleRequest,
  ) {
    return this.withIdempotency(
      req,
      'PATCH',
      `/guest-parties/${guestPartyId}/private-data`,
      { dto, ifMatch },
      () => this.privateData.patchGuest(guestPartyId, dto, ifMatch),
    );
  }

  @Post('guest-parties/:guestPartyId/snapshots')
  @Idempotent()
  guestSnapshot(
    @Param('guestPartyId') guestPartyId: string,
    @Req() req: MstyleRequest,
  ) {
    return this.withIdempotency(
      req,
      'POST',
      `/guest-parties/${guestPartyId}/snapshots`,
      {},
      () => this.privateData.snapshotGuest(guestPartyId),
    );
  }

  @Post('guest-parties/:guestPartyId/booking-confirmations')
  @Idempotent()
  guestBook(
    @Param('guestPartyId') guestPartyId: string,
    @Body() dto: ConfirmBookingDto,
    @Headers('if-match') ifMatch: string | undefined,
    @Req() req: MstyleRequest,
  ) {
    return this.withIdempotency(
      req,
      'POST',
      `/guest-parties/${guestPartyId}/booking-confirmations`,
      { dto, ifMatch },
      () => this.guests.confirmBooking(guestPartyId, dto, ifMatch),
    );
  }

  @Post('guest-parties/:guestPartyId/claim')
  @Idempotent()
  guestClaim(
    @Param('guestPartyId') guestPartyId: string,
    @Body() dto: ClaimGuestDto,
    @Req() req: MstyleRequest,
  ) {
    return this.withIdempotency(
      req,
      'POST',
      `/guest-parties/${guestPartyId}/claim`,
      dto,
      () => this.guests.claim(guestPartyId, dto, req.mstyleResidentSubject!),
    );
  }

  @Get('guest-parties/:guestPartyId/consents')
  guestConsents(@Param('guestPartyId') guestPartyId: string) {
    return this.guests.listConsents(guestPartyId);
  }

  @Post('guest-parties/:guestPartyId/consents/:documentCode/accept')
  @Idempotent()
  guestAccept(
    @Param('guestPartyId') guestPartyId: string,
    @Param('documentCode') documentCode: string,
    @Body() dto: ConsentAcceptDto,
    @Req() req: MstyleRequest,
  ) {
    return this.withIdempotency(
      req,
      'POST',
      `/guest-parties/${guestPartyId}/consents/${documentCode}/accept`,
      dto,
      () => this.guests.acceptConsent(guestPartyId, documentCode, dto),
    );
  }

  @Post('guest-parties/:guestPartyId/consents/:documentCode/withdraw')
  @Idempotent()
  guestWithdraw(
    @Param('guestPartyId') guestPartyId: string,
    @Param('documentCode') documentCode: string,
    @Req() req: MstyleRequest,
  ) {
    return this.withIdempotency(
      req,
      'POST',
      `/guest-parties/${guestPartyId}/consents/${documentCode}/withdraw`,
      {},
      () => this.guests.withdrawConsent(guestPartyId, documentCode),
    );
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
    const fingerprintBody = {
      body,
      actorRef: req.mstyleActorRef || null,
      residentSubject: req.mstyleResidentSubject || null,
      purposeCode: req.mstylePurposeCode || null,
      stepUpAuthenticationId:
        String(req.headers['x-step-up-authentication-id'] || '') || null,
    };
    const replay = await this.idempotency.replayOrThrow({
      clientId: req.mstyleClientId!,
      idempotencyKey: key,
      method,
      route,
      body: fingerprintBody,
      replayExpiredCode,
    });
    if (replay) return replay;
    const result = await run();
    await this.idempotency.save({
      clientId: req.mstyleClientId!,
      idempotencyKey: key,
      method,
      route,
      body: fingerprintBody,
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
