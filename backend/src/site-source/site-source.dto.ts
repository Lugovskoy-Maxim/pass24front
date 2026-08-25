import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsIn,
  IsMongoId,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class UpdateSiteSourceDto {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsString()
  host?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  port?: number;

  @IsOptional()
  @IsString()
  database?: string;

  @IsOptional()
  @IsString()
  user?: string;

  @IsOptional()
  @IsString()
  password?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  tablePrefix?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  roomPostType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  roomNumberMeta?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  floorMeta?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  areaMeta?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  badgeMeta?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  availabilityMeta?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  officeFormatMeta?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  companyMeta?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  roomStatusMeta?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  businessCenterTaxonomy?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  roomTypeTaxonomy?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  serviceRequestsTable?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  serviceRequestMessagesTable?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  servicesTable?: string;

  @IsOptional()
  @IsBoolean()
  writeEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  autoSyncEnabled?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(60)
  @Max(86400)
  autoSyncIntervalSec?: number;

  @IsOptional()
  @IsBoolean()
  autoApply?: boolean;
}

export class PropertyLinkItemDto {
  @IsString()
  sourceCode: string;

  @IsMongoId()
  targetId: string;
}

export class OfficeLinkItemDto {
  @IsString()
  externalId: string;

  @IsMongoId()
  targetId: string;
}

export class ConfirmLinksDto {
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PropertyLinkItemDto)
  properties?: PropertyLinkItemDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OfficeLinkItemDto)
  offices?: OfficeLinkItemDto[];
}

export class ConfirmSuggestedDto {
  @IsOptional()
  @IsBoolean()
  properties?: boolean;

  @IsOptional()
  @IsBoolean()
  offices?: boolean;
}

export class UnlinkDto {
  @IsOptional()
  @IsString()
  propertyId?: string;

  @IsOptional()
  @IsString()
  officeId?: string;
}

export class PushOfficeDto {
  @IsOptional()
  @IsString()
  number?: string;

  @IsOptional()
  @IsString()
  floor?: string;

  @IsOptional()
  @Type(() => Number)
  areaSqm?: number;

  @IsOptional()
  @IsString()
  company?: string;

  @IsOptional()
  @IsString()
  availability?: string;
}

export class TicketMessageDto {
  @IsString()
  @MaxLength(4000)
  body: string;
}

export const SERVICE_REQUEST_TOPICS = [
  'access',
  'office',
  'parking',
  'engineering',
  'cleaning',
  'security',
  'other',
] as const;

export const SERVICE_REQUEST_STATUSES = [
  'new',
  'open',
  'in_progress',
  'resolved',
  'closed',
  'cancelled',
] as const;

export class CreateServiceRequestDto {
  @IsString()
  @IsIn(SERVICE_REQUEST_TOPICS)
  topic: string;

  @IsString()
  @MinLength(3)
  @MaxLength(160)
  subject: string;

  @IsString()
  @MinLength(5)
  @MaxLength(4000)
  body: string;
}

export class UpdateServiceRequestStatusDto {
  @IsString()
  @IsIn(SERVICE_REQUEST_STATUSES)
  status: string;
}
