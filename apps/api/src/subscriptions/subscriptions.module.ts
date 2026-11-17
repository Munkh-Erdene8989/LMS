import { Module } from '@nestjs/common';
import { SubscriptionPlansService } from './plans.service';
import {
  AdminSubscriptionPlansController,
  SubscriptionCallbackController,
  SubscriptionsController,
} from './subscriptions.controller';
import { SubscriptionsService } from './subscriptions.service';

/** Сарын багц (ticket 17). `CreditsService` (global)-ээр кредит олгоно; сунгалтын cron энд бүртгэгдэнэ. */
@Module({
  controllers: [SubscriptionsController, SubscriptionCallbackController, AdminSubscriptionPlansController],
  providers: [SubscriptionsService, SubscriptionPlansService],
  exports: [SubscriptionsService],
})
export class SubscriptionsModule {}
