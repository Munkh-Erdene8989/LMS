import { Module } from '@nestjs/common';
import { ConfigModule } from './config/config.module';
import { PrismaModule } from './prisma/prisma.module';
import { HealthModule } from './health/health.module';
import { AdaptersModule } from './adapters/adapters.module';
import { AuthModule } from './auth/auth.module';

@Module({
  imports: [ConfigModule, PrismaModule, AdaptersModule, HealthModule, AuthModule],
})
export class AppModule {}
