import { MSTYLE_SCHEMA_VERSION } from './mstyle-v2.constants';
import type {
  MstyleAccessGrant,
  MstyleConsent,
  MstyleContact,
  MstyleContactAssignment,
  MstyleGuestContact,
  MstyleGuestParty,
  MstyleIdentity,
  MstyleMembership,
  MstylePrivateData,
  MstyleProfile,
  MstyleSnapshot,
} from './mstyle-v2.schemas';

export function nowIso(date = new Date()): string {
  return date.toISOString();
}

export function etag(kind: string, revision: number): string {
  return `"${kind}-${revision}"`;
}

export function asIso(value?: Date | string | null): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  return value;
}

export function schema<T extends object>(
  extra: T,
): T & { schemaVersion: typeof MSTYLE_SCHEMA_VERSION } {
  return { schemaVersion: MSTYLE_SCHEMA_VERSION, ...extra };
}

export function safeIdentity(doc: MstyleIdentity) {
  return {
    subject: doc.subject,
    identityStatus: doc.identityStatus,
    authVersion: doc.authVersion,
    revision: doc.revision,
    displayName: doc.displayName,
    name: {
      lastName: doc.name?.lastName ?? null,
      firstName: doc.name?.firstName ?? null,
      middleName: doc.name?.middleName ?? null,
    },
    contactMasks: [] as Array<{ type: 'phone' | 'email'; masked: string }>,
  };
}

export function safeProfile(doc: MstyleProfile) {
  return {
    id: doc.profileId,
    type: doc.type,
    legalForm: doc.legalForm ?? null,
    status: doc.status,
    label: doc.label,
    companyShortName: doc.companyShortName ?? null,
    revision: doc.revision,
    privateDataRevision: doc.privateDataRevision ?? null,
    privateDataComplete: !!doc.privateDataComplete,
    memberPolicy: {
      employeeLimit: doc.memberPolicy?.employeeLimit ?? null,
    },
    sourceLinks: doc.sourceLinks || [],
    createdAt: asIso((doc as any).createdAt) || nowIso(),
    updatedAt: asIso((doc as any).updatedAt) || nowIso(),
  };
}

export function membershipDto(doc: MstyleMembership) {
  return {
    id: doc.membershipId,
    subject: doc.subject,
    profileId: doc.profileId,
    role: doc.role,
    status: doc.status,
    validFrom: doc.validFrom ?? null,
    validUntil: doc.validUntil ?? null,
    revision: doc.revision,
  };
}

export function contactDto(
  doc: MstyleContact | MstyleGuestContact,
  value?: string,
) {
  return {
    contactId: doc.contactId,
    type: doc.type,
    value: value ?? '',
    masked: doc.masked,
    verifiedAt: doc.verifiedAt ?? null,
    revision: doc.revision,
  };
}

export function consentItem(doc: MstyleConsent) {
  return {
    documentCode: doc.documentCode,
    documentVersion: doc.documentVersion,
    documentDigest: doc.documentDigest,
    documentUrl: doc.documentUrl || '',
    locale: doc.locale || 'ru-RU',
    status: doc.status,
    revision: doc.revision,
    acceptedAt: doc.acceptedAt ?? null,
    withdrawnAt: doc.withdrawnAt ?? null,
    auditRef: doc.auditRef ?? null,
  };
}

export function assignmentDto(doc: MstyleContactAssignment) {
  return {
    assignmentId: doc.assignmentId,
    purpose: doc.purpose,
    subject: doc.subject,
    contactId: doc.contactId,
    contactType: doc.contactType,
    contactMask: doc.contactMask,
    contactVerified: !!doc.contactVerified,
    priority: doc.priority,
    status: doc.status,
    revision: doc.revision,
  };
}

export function grantDto(doc: MstyleAccessGrant) {
  return {
    grantId: doc.grantId,
    profileId: doc.profileId,
    resource: doc.resource,
    permissions: doc.permissions,
    status: doc.status,
    validFrom: doc.validFrom ?? null,
    validUntil: doc.validUntil ?? null,
    revision: doc.revision,
  };
}

export function snapshotRef(doc: MstyleSnapshot) {
  return {
    schemaVersion: MSTYLE_SCHEMA_VERSION,
    snapshotId: doc.snapshotId,
    partyType: doc.partyType,
    partyId: doc.partyId,
    snapshotRevision: 1 as const,
    contentDigest: doc.contentDigest,
    eventIds: doc.eventIds || [],
    createdAt: doc.createdAtIso,
    sourceRevisions: doc.sourceRevisions,
  };
}

export function guestStatusDto(doc: MstyleGuestParty) {
  return schema({
    id: doc.guestPartyId,
    status: doc.status,
    purpose: doc.purpose,
    primaryContact: doc.primaryContact,
    privateDataRevision: doc.privateDataRevision ?? null,
    claimedBySubject: doc.claimedBySubject ?? null,
    claimedProfileId: doc.claimedProfileId ?? null,
    revision: doc.revision,
    expiresAt: asIso(doc.expiresAt) || nowIso(),
    createdAt: asIso((doc as any).createdAt) || nowIso(),
    updatedAt: asIso((doc as any).updatedAt) || nowIso(),
  });
}

export function privateStatusDto(
  partyType: 'resident_profile' | 'guest_party',
  partyId: string,
  profileType: 'individual' | 'company',
  legalForm: string | null | undefined,
  doc: MstylePrivateData | null,
  missingFieldCodes: string[],
) {
  return schema({
    partyType,
    partyId,
    profileType,
    legalForm: legalForm ?? null,
    exists: !!doc,
    revision: doc?.revision ?? null,
    complete: missingFieldCodes.length === 0 && !!doc,
    missingFieldCodes,
    editPolicy: doc?.editPolicy || 'initial',
    updatedAt: asIso((doc as any)?.updatedAt),
  });
}

export function parseIfMatch(
  header?: string,
): { kind: string; revision: number } | null {
  if (!header) return null;
  const raw = header.replace(/^W\//, '').replace(/"/g, '').trim();
  const idx = raw.lastIndexOf('-');
  if (idx < 1) return null;
  const revision = Number(raw.slice(idx + 1));
  if (!Number.isFinite(revision)) return null;
  return { kind: raw.slice(0, idx), revision };
}
