import { IsBoolean } from 'class-validator';

export class UpdateMstyleIntegrationSettingsDto {
  @IsBoolean()
  mockResponsesEnabled: boolean;
}
