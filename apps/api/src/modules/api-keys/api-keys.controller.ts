import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { IsString } from 'class-validator';
import { Roles } from '../../common/decorators/roles.decorator';
import { OrgGuard } from '../../common/guards/org.guard';
import { PrismaService } from '../prisma/prisma.service';
import { ApiKeysService } from './api-keys.service';

class CreateKeyDto { @IsString() name!: string; }

@ApiTags('api-keys')
@UseGuards(OrgGuard)
@Controller({ path: 'organizations/:orgId/api-keys', version: '1' })
export class ApiKeysController {
  constructor(
    private keys: ApiKeysService,
    private prisma: PrismaService,
  ) {}

  @Get()
  list(@Param('orgId') orgId: string) {
    return this.prisma.apiKey.findMany({ where: { organizationId: orgId }, select: { id: true, name: true, keyPrefix: true, createdAt: true, revokedAt: true } });
  }

  @Roles('OWNER', 'ADMIN')
  @Post()
  create(@Param('orgId') orgId: string, @Body() dto: CreateKeyDto) {
    return this.keys.create(orgId, dto.name);
  }

  @Roles('OWNER', 'ADMIN')
  @Delete(':keyId')
  revoke(@Param('keyId') keyId: string) {
    return this.keys.revoke(keyId);
  }
}
