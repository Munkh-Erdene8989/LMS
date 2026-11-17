import { Module } from '@nestjs/common';
import { ReferralsModule } from '../referrals/referrals.module';
import { TeacherEarningsService } from './earnings.service';
import { PurchasesController, TeacherEarningsController } from './purchases.controller';
import { PurchasesService } from './purchases.service';

/**
 * Худалдан авалт, эрх, багшийн орлого. Эзэмшил уншихад `./entitlements` (функцууд), орлогын үлдэгдэл /
 * payout бичилтэд `TeacherEarningsService` (ticket 20 энэ модулийг import хийнэ).
 */
@Module({
  imports: [ReferralsModule],
  controllers: [PurchasesController, TeacherEarningsController],
  providers: [PurchasesService, TeacherEarningsService],
  exports: [PurchasesService, TeacherEarningsService],
})
export class PurchasesModule {}
