import { Module } from '@nestjs/common';
import { ChatModule } from '../chat/chat.module';
import { EvalsController } from './evals.controller';
import { EvalsService } from './evals.service';

@Module({
  imports: [ChatModule],
  controllers: [EvalsController],
  providers: [EvalsService],
})
export class EvalsModule {}
