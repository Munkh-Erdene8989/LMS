import { Module } from '@nestjs/common';
import { PayoutsModule } from '../payouts/payouts.module';
import { PurchasesModule } from '../purchases/purchases.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import {
  AdminOverviewController,
  AdminPaymentsController,
  AdminReportsController,
  AdminUsersController,
} from './admin-ops.controller';
import { AdminOverviewService } from './overview.service';
import { AdminUsersService } from './admin-users.service';
import { PaymentReconciliationService } from './payment-reconciliation.service';
import { AdminReportsService } from './reports.service';

/**
 * Админы хэрэглэгчийн удирдлага, төлбөрийн тохирол, тайлан (ticket 22).
 * Мөнгө өөрчлөх бүх үйлдэл эзэмшигч service-ээр: кредит → `CreditsService` (global), орлого →
 * `PayoutsService.adjustEarnings`, subscription олголт → `SubscriptionsService.settleByAdmin`.
 */
@Module({
  imports: [PurchasesModule, PayoutsModule, SubscriptionsModule],
  controllers: [AdminUsersController, AdminPaymentsController, AdminReportsController, AdminOverviewController],
  providers: [AdminUsersService, PaymentReconciliationService, AdminReportsService, AdminOverviewService],
})
export class AdminOpsModule {}
