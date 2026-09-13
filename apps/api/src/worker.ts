import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { IngestionProcessor } from './modules/ingestion/ingestion.processor';

// Standalone worker entrypoint: `npm run start:worker`
// Runs BullMQ processors without HTTP server. Deploy as separate service.
async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  app.enableShutdownHooks();
  app.get(IngestionProcessor);
  console.log('Worker listening on queue: ingestion');
}
bootstrap();
