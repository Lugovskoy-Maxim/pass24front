import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
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

export class SearchProfilesDto extends SchemaVersionDto {
  @IsOptional()
  @IsObject()
  query?: {
    phone?: string;
    email?: string;
    label?: string;
    profileId?: string;
  };

  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

export class OnboardingOwnerDto {
  @ValidateNested()
  @Type(() => IdentifierDto)
  identifier: IdentifierDto;

  @IsOptional()
  @IsString()
  displayName?: string;

  @IsOptional()
  @IsObject()
  name?: {
    lastName?: string | null;
    firstName?: string | null;
    middleName?: string | null;
  };
}

export class OnboardingDto extends SchemaVersionDto {
  @IsIn(['individual', 'company'])
  profileType: 'individual' | 'company';

  @IsOptional()
  @IsIn(['ip', 'ooo'])
  legalForm?: 'ip' | 'ooo' | null;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  label: string;

  @IsOptional()
  @IsString()
  companyShortName?: string | null;

  @ValidateNested()
  @Type(() => OnboardingOwnerDto)
  owner: OnboardingOwnerDto;
}

export class LifecycleDto extends SchemaVersionDto {
  @IsIn(['activate', 'suspend', 'close'])
  transition: 'activate' | 'suspend' | 'close';
}

export class DeletionRequestDto extends SchemaVersionDto {
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(20)
  reasonCodes: string[];
}

export class ChangeRequestDto extends SchemaVersionDto {
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(50)
  fieldCodes: string[];

  @IsOptional()
  @IsObject()
  values?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  reasonCode?: string;
}

export class ChangeDecisionDto extends SchemaVersionDto {
  @IsIn(['approve', 'reject'])
  decision: 'approve' | 'reject';

  @IsOptional()
  @IsString()
  reasonCode?: string;
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
  @IsString()
  validFrom?: string | null;

  @IsOptional()
  @IsString()
  validUntil?: string | null;
}

export class OwnerTransferDto extends SchemaVersionDto {
  @IsString()
  @IsNotEmpty()
  newOwnerSubject: string;
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
  @IsString({ each: true })
  @ArrayMaxSize(50)
  fieldCodes: string[];
}

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
  @IsString()
  @IsNotEmpty()
  operationRef: string;
}

export class CreateGuestDto extends SchemaVersionDto {
  @IsOptional()
  @IsString()
  purpose?: string;

  @IsOptional()
  @IsIn(['primary', 'participant'])
  role?: 'primary' | 'participant';

  @IsOptional()
  @IsString()
  expiresAt?: string;
}

export class ConfirmBookingDto extends SchemaVersionDto {
  @IsString()
  @IsNotEmpty()
  operationRef: string;

  @IsString()
  @IsNotEmpty()
  snapshotId: string;
}

export class ClaimGuestDto extends SchemaVersionDto {
  @IsString()
  @IsNotEmpty()
  subject: string;

  @IsOptional()
  @IsString()
  claimedProfileId?: string;
}

export class SearchGuestsDto extends SchemaVersionDto {
  @IsOptional()
  @IsObject()
  query?: { guestPartyId?: string; phone?: string; email?: string };

  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
