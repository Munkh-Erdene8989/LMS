import { Global, Module } from '@nestjs/common';
import { AdminCreditsController, CreditsController, QPayCallbackController } from './credits.controller';
import { CreditsService } from './credits.service';
import { CreditPackagesService } from './packages.service';
import { PaymentsService } from './payments.service';

/**
 * Global: худалдан авалт (09), дуусгавар (16), subscription (17), админ (22) модулиуд
 * `CreditsService`-ийг шууд inject хийнэ. Балансыг өөр аргаар өөрчлөхгүй.
 */
@Global()
@Module({
  controllers: [CreditsController, QPayCallbackController, AdminCreditsController],
  providers: [CreditsService, CreditPackagesService, PaymentsService],
  exports: [CreditsService, PaymentsService],
})
export class CreditsModule {}
