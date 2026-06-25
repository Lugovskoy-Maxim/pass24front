import { Controller, Get } from '@nestjs/common';

@Controller('config')
export class ConfigController {
  @Get()
  getConfig() {
    return {
      businessCenterName: 'БЦ PASS24',
      workingHoursFrom: '08:00',
      workingHoursTo: '20:00',
      contactPhone: '+7 (495) 123-45-67',
      contactEmail: 'info@pass24.local',
      receptionFloor: '1',
      maxPassesPerDay: 200,
    };
  }
}
