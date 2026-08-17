import { Controller, Post, Req, UseFilters, UseGuards } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Request } from 'express';
import { MstyleEnabledGuard, MstyleProblemFilter } from './mstyle-v2.http';
import { MstyleOauthService } from './mstyle-v2.oauth.service';

@ApiExcludeController()
@UseFilters(MstyleProblemFilter)
@UseGuards(MstyleEnabledGuard)
@Controller('oauth2')
export class MstyleOauthController {
  constructor(private readonly oauth: MstyleOauthService) {}

  @Post('token')
  issue(@Req() req: Request) {
    return this.oauth.issueToken((req.body || {}) as Record<string, string>);
  }
}
