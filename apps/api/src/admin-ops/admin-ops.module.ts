import { Module } from '@nestjs/common';
import { PayoutsModule } from '../payouts/payouts.module';
import { PurchasesModule } from '../purchases/purchases.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { AdminPaymentsController, AdminReportsController, AdminUsersController } from './admin-ops.controller';
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
  controllers: [AdminUsersController, AdminPaymentsController, AdminReportsController],
  providers: [AdminUsersService, PaymentReconciliationService, AdminReportsService],
})
export class AdminOpsModule {}
