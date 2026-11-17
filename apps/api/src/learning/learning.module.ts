import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module';
import { LearningController } from './learning.controller';
import { LearningService } from './learning.service';

/** Суралцах үйл явц (ticket 12): явц, quiz. Сертификат (15), assignment (13) энэ модульд нэмэгдэнэ. */
@Module({
  imports: [CatalogModule],
  controllers: [LearningController],
  providers: [LearningService],
  exports: [LearningService],
})
export class LearningModule {}
