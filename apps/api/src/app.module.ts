import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module';
import { HealthModule } from './health/health.module';
import { AdaptersModule } from './adapters/adapters.module';

@Module({
  imports: [PrismaModule, AdaptersModule, HealthModule],
})
export class AppModule {}
