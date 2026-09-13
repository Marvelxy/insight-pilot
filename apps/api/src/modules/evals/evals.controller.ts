import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { OrgGuard } from '../../common/guards/org.guard';
import { EvalsService } from './evals.service';

@ApiTags('evals')
@UseGuards(OrgGuard)
@Controller({ path: 'organizations/:orgId/evals', version: '1' })
export class EvalsController {
  constructor(private evals: EvalsService) {}

  @Get('runs')
  runs(@Param('orgId') orgId: string) {
    return this.evals.list(orgId);
  }

  @Post('run')
  run(@Param('orgId') orgId: string) {
    return this.evals.run(orgId);
  }
}
