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
import { LearningModule } from './learning/learning.module';
import { MediaModule } from './media/media.module';
import { PayoutsModule } from './payouts/payouts.module';
import { ReviewsModule } from './reviews/reviews.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { CommunityModule } from './community/community.module';
import { AdminOpsModule } from './admin-ops/admin-ops.module';
import { ObservabilityModule } from './observability/observability.module';
import { RateLimitModule } from './rate-limit/rate-limit.module';
import { CourseGrantsModule } from './organizations/course-grants.module';

@Module({
  imports: [
    ObservabilityModule.register(),
    ConfigModule,
    RateLimitModule,
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
    LearningModule,
    MediaModule,
    PayoutsModule,
    ReviewsModule,
    AnalyticsModule,
    CommunityModule,
    AdminOpsModule,
    CourseGrantsModule,
    MaintenanceModule,
  ],
})
export class AppModule {}
