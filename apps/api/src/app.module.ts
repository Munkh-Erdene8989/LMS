import { Module } from '@nestjs/common';
import { ConfigModule } from './config/config.module';
import { PrismaModule } from './prisma/prisma.module';
import { HealthModule } from './health/health.module';
import { AdaptersModule } from './adapters/adapters.module';
import { QueueModule } from './queue/queue.module';
import { NotificationsModule } from './notifications/notifications.module';
import { AuthModule } from './auth/auth.module';
import { MaintenanceModule } from './maintenance/maintenance.module';
import { AdminModule } from './admin/admin.module';
import { TeacherModule } from './teacher/teacher.module';
import { CatalogModule } from './catalog/catalog.module';
import { CreditsModule } from './credits/credits.module';
import { PurchasesModule } from './purchases/purchases.module';
import { SubscriptionsModule } from './subscriptions/subscriptions.module';
import { ReferralsModule } from './referrals/referrals.module';

@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    AdaptersModule,
    QueueModule,
    NotificationsModule,
    HealthModule,
    AuthModule,
    AdminModule,
    TeacherModule,
    CatalogModule,
    CreditsModule,
    ReferralsModule,
    PurchasesModule,
    SubscriptionsModule,
    MaintenanceModule,
  ],
})
export class AppModule {}
