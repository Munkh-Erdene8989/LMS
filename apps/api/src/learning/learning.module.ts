import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module';
import { CertificatesController, PublicCertificatesController } from './certificates.controller';
import { CertificatesService } from './certificates.service';
import { LearningController } from './learning.controller';
import { LearningService } from './learning.service';

/** Суралцах үйл явц (ticket 12): явц, quiz; сертификат (15). Assignment (13) энэ модульд нэмэгдэнэ. */
@Module({
  imports: [CatalogModule],
  controllers: [LearningController, CertificatesController, PublicCertificatesController],
  providers: [LearningService, CertificatesService],
  exports: [LearningService, CertificatesService],
})
export class LearningModule {}
