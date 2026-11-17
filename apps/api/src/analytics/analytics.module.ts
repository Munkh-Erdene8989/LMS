import { Module } from '@nestjs/common';
import { PurchasesModule } from '../purchases/purchases.module';
import { TeacherAnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';

/** Багшийн аналитик (ticket 21): борлуулалт, attribution, дуусгалт, видео үзэлт (Mux Data). Зөвхөн уншина. */
@Module({
  imports: [PurchasesModule],
  controllers: [TeacherAnalyticsController],
  providers: [AnalyticsService],
})
export class AnalyticsModule {}
