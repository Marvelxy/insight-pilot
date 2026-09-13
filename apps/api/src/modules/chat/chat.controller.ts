import { Body, Controller, Param, Post, Res, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import type { Response } from 'express';
import { CurrentAuth } from '../../common/decorators/current-auth.decorator';
import { OrgGuard } from '../../common/guards/org.guard';
import { ChatService } from './chat.service';

class QueryDto {
  @IsString() question!: string;
  @IsOptional() @IsString() conversationId?: string;
}

@ApiTags('chat')
@UseGuards(OrgGuard)
@Controller({ path: 'organizations/:orgId/chat', version: '1' })
export class ChatController {
  constructor(private chat: ChatService) {}

  @Post('query')
  async query(
    @Param('orgId') orgId: string,
    @CurrentAuth() auth: { userId: string },
    @Body() dto: QueryDto,
    @Res() res: Response,
  ) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    for await (const chunk of this.chat.streamAnswer(orgId, auth.userId, dto.conversationId, dto.question)) {
      res.write(chunk);
    }
    res.end();
  }
}
