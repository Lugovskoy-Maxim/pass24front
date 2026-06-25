import { Controller, Get, Param } from '@nestjs/common';
import { PassesService } from './passes.service';

@Controller('passes/public')
export class PassesPublicController {
  constructor(private readonly passesService: PassesService) {}

  @Get(':passNumber')
  getTicket(@Param('passNumber') passNumber: string) {
    return this.passesService.getPublicTicket(passNumber);
  }
}