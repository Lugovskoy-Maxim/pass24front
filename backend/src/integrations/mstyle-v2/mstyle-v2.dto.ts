import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { MSTYLE_SCHEMA_VERSION } from './mstyle-v2.constants';

export class SchemaVersionDto {
  @IsString()
  @IsIn([MSTYLE_SCHEMA_VERSION])
  schemaVersion: string;
}

export class AuthContextDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  ipAddress: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(512)
  userAgent: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  locale?: string;
}

export class IdentifierDto {
  @IsIn(['phone', 'email'])
  type: 'phone' | 'email';

  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  value: string;
}

export class PasswordVerifyDto extends SchemaVersionDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  login: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(256)
  password: string;

  @ValidateNested()
  @Type(() => AuthContextDto)
  context: AuthContextDto;
}

export class CodeChallengeDto extends SchemaVersionDto {
  @ValidateNested()
  @Type(() => IdentifierDto)
  identifier: IdentifierDto;

  @IsIn(['sms', 'telegram', 'email'])
  channel: 'sms' | 'telegram' | 'email';

  @ValidateNested()
  @Type(() => AuthContextDto)
  context: AuthContextDto;
}

export class VerifyCodeDto extends SchemaVersionDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{4}$/, { message: 'code must contain exactly 4 digits' })
  code: string;

  @ValidateNested()
  @Type(() => AuthContextDto)
  context: AuthContextDto;
}

export class PatchProfileDto extends SchemaVersionDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  label?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  companyShortName?: string | null;

  @IsOptional()
  @IsObject()
  memberPolicy?: { employeeLimit?: number | null };
}

export class PatchIdentityDto extends SchemaVersionDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  displayName?: string;

  @IsOptional()
  @IsObject()
  name?: {
    lastName?: string | null;
    firstName?: string | null;
    middleName?: string | null;
  };
}

export class UpdatedAtSortDto {
  @IsIn(['updatedAt'])
  field: 'updatedAt';

  @IsIn(['asc', 'desc'])
  direction: 'asc' | 'desc';
}

export class SearchQueryDto {
  @IsIn(['profileId', 'email', 'phone', 'text'])
  type: 'profileId' | 'email' | 'phone' | 'text';

  @IsString()
  @IsNotEmpty()
  @MaxLength(256)
  value: string;
}

export class ProfileSearchFiltersDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @IsString({ each: true })
  profileIds: string[];
}

export class SearchProfilesDto extends SchemaVersionDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => SearchQueryDto)
  query?: SearchQueryDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => ProfileSearchFiltersDto)
  filters?: ProfileSearchFiltersDto;

  @IsOptional()
  @IsString()
  cursor?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @ValidateNested()
  @Type(() => UpdatedAtSortDto)
  sort?: UpdatedAtSortDto;
}

export class OnboardingInvitationDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  displayName: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(254)
  email?: string;
}

export class OnboardingOwnerDto {
  @ValidateNested()
  @Type(() => OnboardingInvitationDto)
  invitation: OnboardingInvitationDto;
}

export class MemberPolicyDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  employeeLimit?: number | null;
}

export class OnboardingProfileDto {
  @IsIn(['individual', 'company'])
  type: 'individual' | 'company';

  @IsOptional()
  @IsIn(['ip', 'ooo'])
  legalForm?: 'ip' | 'ooo' | null;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  label: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => MemberPolicyDto)
  memberPolicy?: MemberPolicyDto;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  companyShortName?: string | null;
}

export class PrivateDataInputDto {
  @IsIn(['individual', 'company'])
  profileType: 'individual' | 'company';

  @IsOptional()
  @IsIn(['ip', 'ooo'])
  legalForm?: 'ip' | 'ooo' | null;

  @IsObject()
  data: Record<string, unknown>;
}

export class OnboardingContactSourceDto {
  @IsIn(['owner_invitation_contact'])
  kind: 'owner_invitation_contact';

  @IsIn(['phone', 'email'])
  contactType: 'phone' | 'email';
}

export class OnboardingContactAssignmentDto {
  @IsIn(['primary', 'contract', 'billing'])
  purpose: 'primary' | 'contract' | 'billing';

  @ValidateNested()
  @Type(() => OnboardingContactSourceDto)
  source: OnboardingContactSourceDto;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  priority: number;
}

export class SourceLinkDto {
  @IsIn(['mstyle-wordpress'])
  sourceSystem: string;

  @IsString()
  @IsNotEmpty()
  environment: string;

  @IsIn(['resident'])
  entityType: string;

  @IsString()
  @IsNotEmpty()
  externalId: string;
}

export class OnboardingDto extends SchemaVersionDto {
  @ValidateNested()
  @Type(() => OnboardingOwnerDto)
  owner: OnboardingOwnerDto;

  @ValidateNested()
  @Type(() => OnboardingProfileDto)
  profile: OnboardingProfileDto;

  @ValidateNested()
  @Type(() => PrivateDataInputDto)
  privateData: PrivateDataInputDto;

  @IsArray()
  @ArrayMaxSize(6)
  @ValidateNested({ each: true })
  @Type(() => OnboardingContactAssignmentDto)
  initialContactAssignments: OnboardingContactAssignmentDto[];

  @ValidateNested()
  @Type(() => SourceLinkDto)
  sourceLink: SourceLinkDto;
}

export class LifecycleDto extends SchemaVersionDto {
  @IsIn(['active', 'suspended', 'closed'])
  targetStatus: 'active' | 'suspended' | 'closed';

  @IsString()
  @IsNotEmpty()
  reasonCode: string;
}

export class DeletionRequestDto extends SchemaVersionDto {
  @IsIn(['anonymize', 'delete'])
  mode: 'anonymize' | 'delete';

  @IsString()
  @IsNotEmpty()
  reasonCode: string;
}

export class ChangeRequestDto extends SchemaVersionDto {
  @IsString()
  @IsNotEmpty()
  reasonCode: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedPrivateDataRevision: number;

  @ValidateNested()
  @Type(() => PrivateDataInputDto)
  privateData: PrivateDataInputDto;
}

export class ChangeDecisionDto extends SchemaVersionDto {
  @IsIn(['approve', 'reject'])
  decision: 'approve' | 'reject';

  @IsString()
  @IsNotEmpty()
  reasonCode: string;
}

export class CreateMembershipDto extends SchemaVersionDto {
  @ValidateNested()
  @Type(() => IdentifierDto)
  identifier: IdentifierDto;

  @IsOptional()
  @IsString()
  displayName?: string;
}

export class PatchMembershipDto extends SchemaVersionDto {
  @IsOptional()
  @IsIn(['active', 'suspended'])
  status?: 'active' | 'suspended';

  @IsOptional()
  @IsISO8601({ strict: true })
  validFrom?: string | null;

  @IsOptional()
  @IsISO8601({ strict: true })
  validUntil?: string | null;

  @IsString()
  @IsNotEmpty()
  reasonCode: string;
}

export class OwnerTransferDto extends SchemaVersionDto {
  @IsString()
  @IsNotEmpty()
  newOwnerSubject: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedProfileRevision: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedMembershipSetRevision: number;

  @IsString()
  @IsNotEmpty()
  reasonCode: string;
}

export class ReasonCodeDto extends SchemaVersionDto {
  @IsString()
  @IsNotEmpty()
  reasonCode: string;
}

export class ContactChallengeDto extends SchemaVersionDto {
  @IsIn(['phone', 'email'])
  type: 'phone' | 'email';

  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  value: string;
}

export class ContactVerifyDto extends SchemaVersionDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(16)
  code: string;
}

export class AssignmentItemDto {
  @IsString()
  @IsNotEmpty()
  purpose: string;

  @IsString()
  @IsNotEmpty()
  subject: string;

  @IsString()
  @IsNotEmpty()
  contactId: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  priority?: number;

  @IsOptional()
  @IsString()
  status?: string;
}

export class PatchAssignmentsDto extends SchemaVersionDto {
  @Type(() => Number)
  @IsInt()
  assignmentSetRevision: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AssignmentItemDto)
  items: AssignmentItemDto[];
}

export class ConsentAcceptDto extends SchemaVersionDto {
  @IsString()
  @IsNotEmpty()
  documentVersion: string;

  @IsString()
  @IsNotEmpty()
  documentDigest: string;

  @IsOptional()
  @IsString()
  documentUrl?: string;

  @IsOptional()
  @IsString()
  locale?: string;
}

export class RevealDto extends SchemaVersionDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  @ArrayMaxSize(50)
  fieldCodes: string[];
}

export class ProfileContactsRevealDto extends RevealDto {
  @IsIn(['primary', 'contract', 'billing'])
  contactPurpose: 'primary' | 'contract' | 'billing';
}

export class OperationRefDto {
  @IsIn(['mstyle'])
  sourceSystem: string;

  @IsString()
  @IsNotEmpty()
  environment: string;

  @IsIn(['booking'])
  operationType: string;

  @IsString()
  @IsNotEmpty()
  operationId: string;
}

export class SnapshotRevealDto extends RevealDto {
  @ValidateNested()
  @Type(() => OperationRefDto)
  operationRef: OperationRefDto;
}

export class SnapshotContactsRevealDto extends SnapshotRevealDto {}

export class PatchPrivateDataDto extends SchemaVersionDto {
  @IsObject()
  values: Record<string, unknown>;
}

export class CreateSnapshotDto extends SchemaVersionDto {
  @IsOptional()
  @IsString()
  purpose?: string;
}

export class BindSnapshotDto extends SchemaVersionDto {
  @ValidateNested()
  @Type(() => OperationRefDto)
  operationRef: OperationRefDto;
}

export class CreateGuestDto extends SchemaVersionDto {
  @IsOptional()
  @IsString()
  purpose?: string;

  @IsOptional()
  @IsIn(['primary', 'participant'])
  role?: 'primary' | 'participant';

  @IsOptional()
  @IsISO8601({ strict: true })
  expiresAt?: string;
}

export class ConfirmBookingDto extends SchemaVersionDto {
  @ValidateNested()
  @Type(() => OperationRefDto)
  operationRef: OperationRefDto;

  @IsString()
  @IsNotEmpty()
  snapshotId: string;
}

export class ClaimGuestDto extends SchemaVersionDto {
  @IsString()
  @IsNotEmpty()
  profileId: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedGuestPartyRevision: number;
}

export class GuestSearchQueryDto {
  @IsIn(['guestPartyId', 'email', 'phone'])
  type: 'guestPartyId' | 'email' | 'phone';

  @IsString()
  @IsNotEmpty()
  @MaxLength(256)
  value: string;
}

export class SearchGuestsDto extends SchemaVersionDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => GuestSearchQueryDto)
  query?: GuestSearchQueryDto;

  @IsOptional()
  @IsString()
  cursor?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @ValidateNested()
  @Type(() => UpdatedAtSortDto)
  sort?: UpdatedAtSortDto;
}
