import { Module } from '@nestjs/common';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { UsageModule } from '../usage/usage.module';

@Module({ imports: [UsageModule], controllers: [ChatController], providers: [ChatService], exports: [ChatService] })
export class ChatModule {}
