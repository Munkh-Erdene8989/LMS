import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module';
import { LearnerAssignmentsController, TeacherAssignmentsController } from './assignments.controller';
import { AssignmentsService } from './assignments.service';
import { LearningController } from './learning.controller';
import { LearningService } from './learning.service';

/** Суралцах үйл явц: явц, quiz (ticket 12), даалгавар (ticket 13). Сертификат (15) энэ модульд нэмэгдэнэ. */
@Module({
  imports: [CatalogModule],
  controllers: [LearningController, LearnerAssignmentsController, TeacherAssignmentsController],
  providers: [LearningService, AssignmentsService],
  exports: [LearningService],
})
export class LearningModule {}
