import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type EncryptedBlob = {
  keyVersion: number;
  iv: string;
  tag: string;
  ciphertext: string;
};

export type OperationReference = {
  sourceSystem: string;
  environment: string;
  operationType: string;
  operationId: string;
};

@Schema({ collection: 'mstyle_v2_service_tokens', timestamps: true })
export class MstyleServiceToken {
  @Prop({ required: true, unique: true })
  tokenHash: string;

  @Prop({ required: true })
  clientId: string;

  @Prop({ type: [String], default: [] })
  scopes: string[];

  @Prop({ required: true })
  aud: string;

  @Prop({ required: true })
  expiresAt: Date;
}
export type MstyleServiceTokenDocument = MstyleServiceToken & Document;
export const MstyleServiceTokenSchema =
  SchemaFactory.createForClass(MstyleServiceToken);
MstyleServiceTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

@Schema({ collection: 'mstyle_v2_oauth_jti', timestamps: true })
export class MstyleOauthJti {
  @Prop() nonce?: string;
  @Prop() tokenType?: string;
  @Prop({ required: true, unique: true })
  jti: string;

  @Prop({ required: true })
  clientId: string;

  @Prop({ required: true })
  expiresAt: Date;
}
export type MstyleOauthJtiDocument = MstyleOauthJti & Document;
export const MstyleOauthJtiSchema =
  SchemaFactory.createForClass(MstyleOauthJti);
MstyleOauthJtiSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

@Schema({ collection: 'mstyle_v2_authentications', timestamps: true })
export class MstyleAuthentication {
  @Prop({ required: true, unique: true })
  authenticationId: string;

  @Prop({ required: true, index: true })
  subject: string;

  @Prop({ required: true })
  method: string;

  @Prop({ required: true })
  authVersion: number;

  @Prop({ required: true })
  authenticatedAt: string;

  @Prop({ required: true })
  expiresAt: Date;
}
export type MstyleAuthenticationDocument = MstyleAuthentication & Document;
export const MstyleAuthenticationSchema =
  SchemaFactory.createForClass(MstyleAuthentication);
MstyleAuthenticationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

@Schema({ collection: 'mstyle_v2_admin_assertion_jti', timestamps: true })
export class MstyleAdminAssertionJti {
  @Prop() issuer?: string;
  @Prop() tokenType?: string;
  @Prop() nonce?: string;
  @Prop({ required: true, unique: true })
  jti: string;

  @Prop({ required: true })
  actor: string;

  @Prop({ required: true })
  expiresAt: Date;
}
export type MstyleAdminAssertionJtiDocument = MstyleAdminAssertionJti &
  Document;
export const MstyleAdminAssertionJtiSchema = SchemaFactory.createForClass(
  MstyleAdminAssertionJti,
);
MstyleAdminAssertionJtiSchema.index(
  { expiresAt: 1 },
  { expireAfterSeconds: 0 },
);

@Schema({ collection: 'mstyle_v2_admin_assertion_audit', timestamps: true })
export class MstyleAdminAssertionAudit {
  @Prop({ required: true }) clientId: string;
  @Prop({ required: true }) actorRef: string;
  @Prop({ required: true }) route: string;
  @Prop({ default: '' }) purpose: string;
  @Prop({ required: true, index: true }) requestId: string;
  @Prop() jti?: string;
  @Prop({ required: true }) result: string;
  @Prop() detail?: string;
}
export const MstyleAdminAssertionAuditSchema = SchemaFactory.createForClass(
  MstyleAdminAssertionAudit,
);

@Schema({ collection: 'mstyle_v2_identities', timestamps: true })
export class MstyleIdentity {
  @Prop({ required: true, unique: true })
  subject: string;

  @Prop({ unique: true, sparse: true })
  userId?: string;

  // Native User owns credentials and account restrictions; business data is imported once.
  @Prop() userSecurityStamp?: string;
  @Prop() userSecurityStatus?: string;
  @Prop({ type: String, default: null }) userRestrictionPreviousStatus?:
    string | null;

  @Prop({
    required: true,
    enum: ['invited', 'active', 'blocked', 'disabled', 'deleted'],
  })
  identityStatus: string;

  @Prop({ required: true, default: 1 })
  authVersion: number;

  @Prop({ required: true, default: 1 })
  revision: number;

  @Prop({ required: true, default: 1 })
  contextRevision: number;

  @Prop({ default: '' })
  displayName: string;

  @Prop({ type: Object, default: {} })
  name: {
    lastName: string | null;
    firstName: string | null;
    middleName: string | null;
  };

  @Prop({ lowercase: true, trim: true })
  login?: string;

  @Prop()
  phone?: string;

  @Prop({ lowercase: true, trim: true })
  email?: string;

  @Prop({ default: false })
  isDummy: boolean;
}
export type MstyleIdentityDocument = MstyleIdentity & Document;
export const MstyleIdentitySchema =
  SchemaFactory.createForClass(MstyleIdentity);
MstyleIdentitySchema.index({ phone: 1 }, { unique: true, sparse: true });
MstyleIdentitySchema.index({ email: 1 }, { unique: true, sparse: true });
MstyleIdentitySchema.index({ login: 1 }, { unique: true, sparse: true });

@Schema({ collection: 'mstyle_v2_profiles', timestamps: true })
export class MstyleProfile {
  @Prop({ required: true, unique: true })
  profileId: string;

  @Prop({ required: true, enum: ['individual', 'company'] })
  type: string;

  @Prop({ type: String, default: null })
  legalForm: string | null;

  @Prop({
    required: true,
    enum: ['draft', 'active', 'suspended', 'closed', 'deleted'],
  })
  status: string;

  @Prop({ required: true })
  label: string;

  @Prop({ type: String, default: null })
  companyShortName: string | null;

  @Prop({ required: true, default: 1 })
  revision: number;

  @Prop({ type: Number, default: null })
  privateDataRevision: number | null;

  @Prop({ default: false })
  privateDataComplete: boolean;

  @Prop({ type: Object, default: { employeeLimit: null } })
  memberPolicy: { employeeLimit: number | null };

  @Prop({ type: [Object], default: [] })
  sourceLinks: Array<{
    sourceSystem: string;
    environment: string;
    entityType: string;
    externalId: string;
    linkedAt: string;
  }>;

  @Prop({ default: 1 })
  assignmentSetRevision: number;

  @Prop({ default: 1 })
  membershipSetRevision: number;

  @Prop({ default: 1 })
  accessFactsRevision: number;
}
export type MstyleProfileDocument = MstyleProfile & Document;
export const MstyleProfileSchema = SchemaFactory.createForClass(MstyleProfile);
MstyleProfileSchema.index(
  {
    'sourceLinks.sourceSystem': 1,
    'sourceLinks.environment': 1,
    'sourceLinks.entityType': 1,
    'sourceLinks.externalId': 1,
  },
  {
    unique: true,
    partialFilterExpression: {
      'sourceLinks.externalId': { $type: 'string' },
    },
  },
);

@Schema({ collection: 'mstyle_v2_memberships', timestamps: true })
export class MstyleMembership {
  @Prop({ required: true, unique: true })
  membershipId: string;

  @Prop({ required: true, index: true })
  subject: string;

  @Prop({ required: true, index: true })
  profileId: string;

  @Prop({ required: true, enum: ['owner', 'employee'] })
  role: string;

  @Prop({
    required: true,
    enum: ['invited', 'active', 'suspended', 'revoked'],
  })
  status: string;

  @Prop({ type: String, default: null })
  validFrom: string | null;

  @Prop({ type: String, default: null })
  validUntil: string | null;

  @Prop({ default: 1 })
  revision: number;
}
export type MstyleMembershipDocument = MstyleMembership & Document;
export const MstyleMembershipSchema =
  SchemaFactory.createForClass(MstyleMembership);
MstyleMembershipSchema.index({ profileId: 1, subject: 1 }, { unique: true });
MstyleMembershipSchema.index(
  { profileId: 1 },
  {
    unique: true,
    name: 'one_active_owner_per_profile',
    partialFilterExpression: { role: 'owner', status: 'active' },
  },
);
MstyleMembershipSchema.index(
  { subject: 1 },
  {
    unique: true,
    name: 'one_active_employee_profile',
    partialFilterExpression: { role: 'employee', status: 'active' },
  },
);

@Schema({ collection: 'mstyle_v2_contacts', timestamps: true })
export class MstyleContact {
  @Prop({ required: true, unique: true })
  contactId: string;

  @Prop({ required: true, index: true })
  subject: string;

  @Prop({ required: true, enum: ['phone', 'email'] })
  type: string;

  @Prop({ required: true })
  masked: string;

  @Prop({ type: Object, required: true })
  valueEnc: EncryptedBlob;

  @Prop({ required: true })
  valueHash: string;

  @Prop({ type: String, default: null })
  verifiedAt: string | null;

  @Prop({ default: 1 })
  revision: number;
}
export type MstyleContactDocument = MstyleContact & Document;
export const MstyleContactSchema = SchemaFactory.createForClass(MstyleContact);
MstyleContactSchema.index(
  { subject: 1, type: 1, valueHash: 1 },
  { unique: true },
);

@Schema({ collection: 'mstyle_v2_contact_assignments', timestamps: true })
export class MstyleContactAssignment {
  @Prop({ required: true, unique: true })
  assignmentId: string;

  @Prop({ required: true, index: true })
  profileId: string;

  @Prop({ required: true })
  purpose: string;

  @Prop({ required: true })
  subject: string;

  @Prop({ required: true })
  contactId: string;

  @Prop({ required: true })
  contactType: string;

  @Prop({ required: true })
  contactMask: string;

  @Prop({ default: false })
  contactVerified: boolean;

  @Prop({ default: 1 })
  priority: number;

  @Prop({ default: 'active' })
  status: string;

  @Prop({ default: 1 })
  revision: number;
}
export type MstyleContactAssignmentDocument = MstyleContactAssignment &
  Document;
export const MstyleContactAssignmentSchema = SchemaFactory.createForClass(
  MstyleContactAssignment,
);

@Schema({ collection: 'mstyle_v2_consents', timestamps: true })
export class MstyleConsent {
  @Prop({ required: true, index: true })
  partyType: 'resident' | 'guest';

  @Prop({ required: true, index: true })
  partyId: string;

  @Prop({ required: true })
  documentCode: string;

  @Prop({ required: true })
  documentVersion: string;

  @Prop({ required: true })
  documentDigest: string;

  @Prop({ default: '' })
  documentUrl: string;

  @Prop({ default: 'ru-RU' })
  locale: string;

  @Prop({ required: true, enum: ['accepted', 'withdrawn', 'required'] })
  status: string;

  @Prop({ default: 1 })
  revision: number;

  @Prop({ type: String, default: null })
  acceptedAt: string | null;

  @Prop({ type: String, default: null })
  withdrawnAt: string | null;

  @Prop({ type: String, default: null })
  auditRef: string | null;

  @Prop({ type: [Object], default: [] })
  history: Array<{
    status: string;
    documentVersion: string;
    documentDigest: string;
    documentUrl: string;
    locale: string;
    auditRef: string;
    recordedAt: string;
    evidenceCode?: string;
    reasonCode?: string;
  }>;
}
export type MstyleConsentDocument = MstyleConsent & Document;
export const MstyleConsentSchema = SchemaFactory.createForClass(MstyleConsent);
MstyleConsentSchema.index(
  { partyType: 1, partyId: 1, documentCode: 1 },
  { unique: true },
);

@Schema({ collection: 'mstyle_v2_consent_sets', timestamps: true })
export class MstyleConsentSet {
  @Prop({ required: true }) partyType: string;
  @Prop({ required: true }) partyId: string;
  @Prop({ default: 1 }) revision: number;
}
export const MstyleConsentSetSchema =
  SchemaFactory.createForClass(MstyleConsentSet);
MstyleConsentSetSchema.index({ partyType: 1, partyId: 1 }, { unique: true });

@Schema({ collection: 'mstyle_v2_private_data', timestamps: true })
export class MstylePrivateData {
  @Prop({ required: true, enum: ['resident_profile', 'guest_party'] })
  partyType: string;

  @Prop({ required: true })
  partyId: string;

  @Prop({ required: true, enum: ['individual', 'company'] })
  profileType: string;

  @Prop({ type: String, default: null })
  legalForm?: string | null;

  @Prop({ default: 1 })
  revision: number;

  @Prop({
    default: 'initial',
    enum: ['initial', 'self_service', 'request_only', 'locked'],
  })
  editPolicy: string;

  @Prop({ type: Object, required: true })
  valuesEnc: EncryptedBlob;
}
export type MstylePrivateDataDocument = MstylePrivateData & Document;
export const MstylePrivateDataSchema =
  SchemaFactory.createForClass(MstylePrivateData);
MstylePrivateDataSchema.index({ partyType: 1, partyId: 1 }, { unique: true });

@Schema({ collection: 'mstyle_v2_challenges', timestamps: true })
export class MstyleChallenge {
  @Prop() authVersion?: number;
  @Prop({ required: true, unique: true })
  challengeId: string;

  @Prop({ required: true, enum: ['auth', 'contact', 'guest_contact'] })
  kind: string;

  @Prop({ required: true })
  clientId: string;

  @Prop({
    required: true,
    enum: ['dispatch_pending', 'awaiting_code', 'consumed', 'expired'],
  })
  status: string;

  @Prop()
  channel?: string;

  @Prop()
  identifierType?: string;

  @Prop()
  identifierHash?: string;

  @Prop({ type: String, default: null })
  subject?: string | null;

  @Prop({ default: false })
  isDummy: boolean;

  @Prop({ required: true })
  codeHash: string;

  @Prop({ default: 4 })
  codeLength: number;

  @Prop({ enum: ['local', 'smsaero_mobile_id'], default: 'local' })
  verificationProvider?: string;

  @Prop({ type: Number })
  mobileIdRequestId?: number;

  @Prop()
  mobileIdAuthType?: string;

  @Prop({ default: 0 })
  verifyAttempts: number;

  @Prop({ required: true })
  expiresAt: Date;

  @Prop({ required: true })
  resendAfter: Date;

  @Prop({ type: Object })
  telegramAction?: { botUsername: string; deepLink: string };

  @Prop()
  contactType?: string;

  @Prop()
  displayMasked?: string;

  @Prop({ type: Number })
  expectedContactValueRevision?: number;

  @Prop({ type: Number }) baseContactValueRevision?: number;
  @Prop({ type: Number }) contactProofVersion?: number;
  @Prop({ type: Date }) verificationApprovedAt?: Date;

  @Prop()
  guestPartyId?: string;

  @Prop({ type: Object })
  pendingValueEnc?: EncryptedBlob;

  @Prop()
  consumedAuthJson?: string;

  @Prop()
  consumedAt?: Date;
}
export type MstyleChallengeDocument = MstyleChallenge & Document;
export const MstyleChallengeSchema =
  SchemaFactory.createForClass(MstyleChallenge);
MstyleChallengeSchema.index({ expiresAt: 1 });

@Schema({ collection: 'mstyle_v2_guest_parties', timestamps: true })
export class MstyleGuestParty {
  @Prop({ required: true, unique: true })
  guestPartyId: string;

  @Prop({ default: 'draft' })
  status: string;

  @Prop({ default: 'booking' })
  purpose: string;

  @Prop({ default: 'primary' })
  role: string;

  @Prop({ type: Object })
  primaryContact?: {
    type: string;
    displayMasked: string;
    verifiedAt: string | null;
  };

  @Prop({ type: Number, default: null })
  privateDataRevision: number | null;

  @Prop({ type: String, default: null })
  claimedBySubject?: string | null;

  @Prop({ type: String, default: null })
  claimedProfileId?: string | null;

  @Prop({ default: 1 })
  revision: number;

  @Prop({ required: true })
  expiresAt: Date;

  @Prop()
  guestFlowAccessTokenHash?: string;

  @Prop() displayName?: string;

  @Prop({ default: 1 })
  consentSetRevision: number;

  @Prop({ type: Object })
  operationLink?: {
    operationRef: OperationReference;
    snapshotId: string;
    bindingRevision?: number;
    schemaVersion?: string;
    id?: string;
    revision?: number;
    createdAt?: string;
    eventIds?: string[];
  };
}
export type MstyleGuestPartyDocument = MstyleGuestParty & Document;
export const MstyleGuestPartySchema =
  SchemaFactory.createForClass(MstyleGuestParty);
MstyleGuestPartySchema.index(
  { guestFlowAccessTokenHash: 1 },
  { unique: true, sparse: true },
);

@Schema({ collection: 'mstyle_v2_guest_contacts', timestamps: true })
export class MstyleGuestContact {
  @Prop({ required: true, unique: true })
  contactId: string;

  @Prop({ required: true, index: true })
  guestPartyId: string;

  @Prop({ required: true, enum: ['phone', 'email'] })
  type: string;

  @Prop({ required: true })
  masked: string;

  @Prop({ type: Object, required: true })
  valueEnc: EncryptedBlob;

  @Prop({ required: true })
  valueHash: string;

  @Prop({ type: String, default: null })
  verifiedAt: string | null;

  @Prop({ default: 1 })
  revision: number;
}
export type MstyleGuestContactDocument = MstyleGuestContact & Document;
export const MstyleGuestContactSchema =
  SchemaFactory.createForClass(MstyleGuestContact);

@Schema({ collection: 'mstyle_v2_snapshots', timestamps: true })
export class MstyleSnapshot {
  @Prop({ required: true, unique: true })
  snapshotId: string;

  @Prop({
    type: String,
    required: true,
    enum: ['resident_profile', 'guest_party'],
  })
  partyType: 'resident_profile' | 'guest_party';

  @Prop({ required: true })
  partyId: string;

  @Prop({ default: 1 })
  snapshotRevision: number;

  @Prop({ type: Object, required: true })
  contentDigest: {
    algorithm: 'HMAC-SHA-256';
    keyVersion: number;
    value: string;
  };

  @Prop({ type: [String], default: [] })
  eventIds: string[];

  @Prop({ type: Object, required: true })
  sourceRevisions: Record<string, unknown>;

  @Prop({ type: Object, required: true })
  payloadEnc: EncryptedBlob;

  @Prop({ required: true })
  createdAtIso: string;
}
export type MstyleSnapshotDocument = MstyleSnapshot & Document;
export const MstyleSnapshotSchema =
  SchemaFactory.createForClass(MstyleSnapshot);

@Schema({ collection: 'mstyle_v2_snapshot_bindings', timestamps: true })
export class MstyleSnapshotBinding {
  @Prop({ required: true, unique: true })
  bindingId: string;

  @Prop({ required: true, index: true })
  snapshotId: string;

  @Prop({ type: Object, required: true })
  operationRef: OperationReference;

  @Prop({ default: 1 })
  bindingRevision: number;

  @Prop({ default: 'bound' })
  status: string;

  @Prop({ required: true })
  boundAt: string;
}
export type MstyleSnapshotBindingDocument = MstyleSnapshotBinding & Document;
export const MstyleSnapshotBindingSchema = SchemaFactory.createForClass(
  MstyleSnapshotBinding,
);
MstyleSnapshotBindingSchema.index(
  { snapshotId: 1 },
  { unique: true, name: 'one_binding_per_snapshot' },
);
MstyleSnapshotBindingSchema.index(
  {
    'operationRef.sourceSystem': 1,
    'operationRef.environment': 1,
    'operationRef.operationType': 1,
    'operationRef.operationId': 1,
  },
  { unique: true, name: 'one_snapshot_per_operation' },
);

@Schema({ collection: 'mstyle_v2_idempotency', timestamps: true })
export class MstyleIdempotency {
  @Prop({ type: Object }) dispatchFailure?: {
    status: number;
    code: string;
    errors?: Array<{ field?: string; code?: string; message?: string }>;
  };
  @Prop() actorRef?: string;
  @Prop({ required: true, unique: true })
  recordKey: string;

  @Prop({ required: true })
  clientId: string;

  @Prop({ required: true })
  idempotencyKey: string;

  @Prop({ required: true })
  method: string;

  @Prop({ required: true })
  route: string;

  @Prop({ required: true })
  requestHmac: string;

  @Prop({ required: true })
  statusCode: number;

  @Prop({ type: Object, required: true })
  responseBody: Record<string, unknown>;

  @Prop({ type: Object, default: {} })
  responseHeaders: Record<string, string>;

  @Prop()
  replayExpiresAt?: Date;

  @Prop({ required: true })
  expiresAt: Date;
}
export type MstyleIdempotencyDocument = MstyleIdempotency & Document;
export const MstyleIdempotencySchema =
  SchemaFactory.createForClass(MstyleIdempotency);
MstyleIdempotencySchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

@Schema({ collection: 'mstyle_v2_change_events', timestamps: true })
export class MstyleChangeEvent {
  @Prop({ required: true, unique: true })
  eventId: string;

  @Prop()
  repairsEventId?: string;

  @Prop({ required: true })
  sequence: number;

  @Prop({ required: true })
  type: string;

  @Prop({ required: true })
  occurredAt: string;

  @Prop({ type: Object, required: true })
  aggregate: { type: string; id: string; revision: number };

  @Prop()
  subject?: string;

  @Prop()
  profileId?: string;

  @Prop()
  guestPartyId?: string;

  @Prop({ type: Object, default: {} })
  payload: Record<string, unknown>;
}
export type MstyleChangeEventDocument = MstyleChangeEvent & Document;
export const MstyleChangeEventSchema =
  SchemaFactory.createForClass(MstyleChangeEvent);
MstyleChangeEventSchema.index({ sequence: 1 }, { unique: true });
MstyleChangeEventSchema.index(
  { repairsEventId: 1 },
  { unique: true, sparse: true },
);
MstyleChangeEventSchema.index({ type: 1, sequence: 1 });

@Schema({ collection: 'mstyle_v2_sequence_counters', timestamps: true })
export class MstyleSequenceCounter {
  @Prop({ required: true, unique: true })
  name: string;

  @Prop({ required: true, default: 0 })
  value: number;
}
export type MstyleSequenceCounterDocument = MstyleSequenceCounter & Document;
export const MstyleSequenceCounterSchema = SchemaFactory.createForClass(
  MstyleSequenceCounter,
);

@Schema({ collection: 'mstyle_v2_change_requests', timestamps: true })
export class MstyleChangeRequest {
  @Prop({ required: true, unique: true })
  changeRequestId: string;

  @Prop({ required: true, index: true })
  profileId: string;

  @Prop({ required: true })
  status: string;

  @Prop({ default: 1 })
  changeRequestRevision: number;

  @Prop({ required: true })
  profileRevisionAtRequest: number;

  @Prop({ required: true })
  privateDataRevisionAtRequest: number;

  @Prop({ type: [String], default: [] })
  changedFieldCodes: string[];

  @Prop({ type: Object })
  valuesEnc?: EncryptedBlob;

  @Prop({ required: true, enum: ['individual', 'company'] })
  profileType: string;

  @Prop({ type: String, default: null })
  legalForm?: string | null;

  @Prop({ default: '' })
  reasonCode: string;

  @Prop({ required: true })
  expiresAt: string;

  @Prop()
  authorSubject?: string;

  @Prop()
  decisionReasonCode?: string;
}
export type MstyleChangeRequestDocument = MstyleChangeRequest & Document;
export const MstyleChangeRequestSchema =
  SchemaFactory.createForClass(MstyleChangeRequest);
MstyleChangeRequestSchema.index(
  { profileId: 1, status: 1 },
  { unique: true, partialFilterExpression: { status: 'pending' } },
);

@Schema({ collection: 'mstyle_v2_deletion_requests', timestamps: true })
export class MstyleDeletionRequest {
  @Prop({ required: true, unique: true })
  deletionRequestId: string;

  @Prop({ required: true, index: true })
  profileId: string;

  @Prop({ required: true, enum: ['anonymize', 'delete'] })
  mode: string;

  @Prop({ required: true })
  reasonCode: string;

  @Prop({ required: true })
  status: string;

  @Prop({ type: [String], default: [] })
  reasonCodes: string[];

  @Prop({ default: 1 })
  deletionRequestRevision: number;

  @Prop({ required: true })
  createdAtIso: string;

  @Prop()
  completedAt?: string;

  @Prop()
  latestEventId?: string;
}
export type MstyleDeletionRequestDocument = MstyleDeletionRequest & Document;
export const MstyleDeletionRequestSchema = SchemaFactory.createForClass(
  MstyleDeletionRequest,
);
MstyleDeletionRequestSchema.index(
  { profileId: 1, status: 1 },
  {
    unique: true,
    partialFilterExpression: { status: { $in: ['pending', 'blocked'] } },
  },
);

@Schema({ collection: 'mstyle_v2_access_grants', timestamps: true })
export class MstyleAccessGrant {
  @Prop({ required: true, unique: true })
  grantId: string;

  @Prop({ required: true, index: true })
  profileId: string;

  @Prop({ type: Object, required: true })
  resource: {
    type: string;
    id: string;
    mstyleLink?: {
      sourceSystem: 'mstyle-wordpress';
      environment: string;
      entityType: 'room';
      externalId: string;
    };
  };

  @Prop({ type: [String], default: [] })
  permissions: string[];

  @Prop({ required: true })
  status: string;

  @Prop({ type: String, default: null })
  validFrom: string | null;

  @Prop({ type: String, default: null })
  validUntil: string | null;

  @Prop({ default: 1 })
  revision: number;
}
export type MstyleAccessGrantDocument = MstyleAccessGrant & Document;
export const MstyleAccessGrantSchema =
  SchemaFactory.createForClass(MstyleAccessGrant);

export const MSTYLE_MODELS = [
  { name: MstyleConsentSet.name, schema: MstyleConsentSetSchema },
  {
    name: MstyleAdminAssertionAudit.name,
    schema: MstyleAdminAssertionAuditSchema,
  },
  { name: MstyleServiceToken.name, schema: MstyleServiceTokenSchema },
  { name: MstyleOauthJti.name, schema: MstyleOauthJtiSchema },
  { name: MstyleAuthentication.name, schema: MstyleAuthenticationSchema },
  {
    name: MstyleAdminAssertionJti.name,
    schema: MstyleAdminAssertionJtiSchema,
  },
  { name: MstyleIdentity.name, schema: MstyleIdentitySchema },
  { name: MstyleProfile.name, schema: MstyleProfileSchema },
  { name: MstyleMembership.name, schema: MstyleMembershipSchema },
  { name: MstyleContact.name, schema: MstyleContactSchema },
  {
    name: MstyleContactAssignment.name,
    schema: MstyleContactAssignmentSchema,
  },
  { name: MstyleConsent.name, schema: MstyleConsentSchema },
  { name: MstylePrivateData.name, schema: MstylePrivateDataSchema },
  { name: MstyleChallenge.name, schema: MstyleChallengeSchema },
  { name: MstyleGuestParty.name, schema: MstyleGuestPartySchema },
  { name: MstyleGuestContact.name, schema: MstyleGuestContactSchema },
  { name: MstyleSnapshot.name, schema: MstyleSnapshotSchema },
  { name: MstyleSnapshotBinding.name, schema: MstyleSnapshotBindingSchema },
  { name: MstyleIdempotency.name, schema: MstyleIdempotencySchema },
  { name: MstyleChangeEvent.name, schema: MstyleChangeEventSchema },
  { name: MstyleSequenceCounter.name, schema: MstyleSequenceCounterSchema },
  { name: MstyleChangeRequest.name, schema: MstyleChangeRequestSchema },
  { name: MstyleDeletionRequest.name, schema: MstyleDeletionRequestSchema },
  { name: MstyleAccessGrant.name, schema: MstyleAccessGrantSchema },
];
