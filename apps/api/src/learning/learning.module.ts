import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module';
import { LearnerAssignmentsController, TeacherAssignmentsController } from './assignments.controller';
import { AssignmentsService } from './assignments.service';
import { CertificatesController, PublicCertificatesController } from './certificates.controller';
import { CertificatesService } from './certificates.service';
import { LearningController } from './learning.controller';
import { LearningService } from './learning.service';

/** Суралцах үйл явц: явц, quiz (ticket 12), даалгавар (13), сертификат (15). */
@Module({
  imports: [CatalogModule],
  controllers: [LearningController, LearnerAssignmentsController, TeacherAssignmentsController, CertificatesController, PublicCertificatesController],
  providers: [LearningService, AssignmentsService, CertificatesService],
  exports: [LearningService, CertificatesService],
})
export class LearningModule {}
