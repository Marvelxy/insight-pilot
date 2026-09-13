import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { IsString } from 'class-validator';
import { CurrentAuth } from '../../common/decorators/current-auth.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { OrgGuard } from '../../common/guards/org.guard';
import { PrismaService } from '../prisma/prisma.service';

class CreateOrgDto {
  @IsString() name!: string;
  @IsString() slug!: string;
}

@ApiTags('organizations')
@Controller({ path: 'organizations', version: '1' })
export class OrganizationsController {
  constructor(private prisma: PrismaService) {}

  @Post()
  async create(@CurrentAuth() auth: { userId: string }, @Body() dto: CreateOrgDto) {
    const org = await this.prisma.organization.create({
      data: {
        name: dto.name,
        slug: dto.slug,
        memberships: { create: { userId: auth.userId, role: 'OWNER' } },
      },
    });
    await this.prisma.auditLog.create({
      data: { organizationId: org.id, userId: auth.userId, action: 'org.created' },
    });
    return org;
  }

  @Get()
  mine(@CurrentAuth() auth: { userId: string }) {
    return this.prisma.organization.findMany({
      where: { memberships: { some: { userId: auth.userId } } },
    });
  }

  @UseGuards(OrgGuard)
  @Roles('OWNER', 'ADMIN')
  @Get(':orgId/members')
  members(@Param('orgId') orgId: string) {
    return this.prisma.membership.findMany({ where: { organizationId: orgId } });
  }
}
