import { Body, Controller, ForbiddenException, Get, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { JwtService } from '@nestjs/jwt';
import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentAuth } from '../../common/decorators/current-auth.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { AuthService } from './auth.service';

class DevLoginDto {
  @IsEmail() email!: string;
  @IsString() orgId!: string;
}

class RegisterDto {
  @IsEmail() email!: string;
  @IsString() @MinLength(8) password!: string;
  @IsOptional() @IsString() name?: string;
}

class LoginDto {
  @IsEmail() email!: string;
  @IsString() password!: string;
  @IsOptional() @IsString() orgId?: string;
}

@ApiTags('auth')
@Controller({ path: 'auth', version: '1' })
export class AuthController {
  constructor(
    private jwt: JwtService,
    private prisma: PrismaService,
    private auth: AuthService,
  ) {}

  @Public()
  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto.email, dto.password, dto.name);
  }

  @Public()
  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto.email, dto.password, dto.orgId);
  }

  // Dev-only shortcut: exchange email+org for a JWT. Disabled in production.
  @Public()
  @Post('dev-login')
  async devLogin(@Body() dto: DevLoginDto) {
    if (process.env.NODE_ENV === 'production') throw new ForbiddenException('Not available in production');
    let user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (!user) user = await this.prisma.user.create({ data: { email: dto.email } });
    const membership = await this.prisma.membership.findUnique({
      where: { userId_organizationId: { userId: user.id, organizationId: dto.orgId } },
    });
    if (!membership) throw new ForbiddenException('Not a member of this organization');
    const token = await this.jwt.signAsync({ sub: user.id, orgId: dto.orgId, role: membership.role });
    return { access_token: token };
  }

  @Get('me')
  me(@CurrentAuth() auth: { userId: string }) {
    return this.prisma.user.findUnique({
      where: { id: auth.userId },
      select: {
        id: true,
        email: true,
        name: true,
        createdAt: true,
        memberships: { select: { organizationId: true, role: true } },
      },
    });
  }
}
