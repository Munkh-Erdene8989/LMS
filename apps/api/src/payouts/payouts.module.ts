import { Module } from '@nestjs/common';
import { PurchasesModule } from '../purchases/purchases.module';
import { AdminPayoutsController, TeacherPayoutsController } from './payouts.controller';
import { PayoutsService } from './payouts.service';

/** Багшийн payout (ticket 20). Ledger-т зөвхөн `TeacherEarningsService`-ээр бичнэ. */
@Module({
  imports: [PurchasesModule],
  controllers: [TeacherPayoutsController, AdminPayoutsController],
  providers: [PayoutsService],
  exports: [PayoutsService],
})
export class PayoutsModule {}
