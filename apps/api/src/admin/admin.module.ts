import { Global, Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AuditService } from './audit.service';
import { LegalController } from './legal.controller';
import { LegalService } from './legal.service';
import { SettingsService } from './settings.service';

/** Global: бусад модуль `SettingsService`, `AuditService`, `LegalService`-ийг шууд ашиглана. */
@Global()
@Module({
  controllers: [AdminController, LegalController],
  providers: [SettingsService, AuditService, LegalService],
  exports: [SettingsService, AuditService, LegalService],
})
export class AdminModule {}
