import { Module } from '@nestjs/common';
import { CourseGrantsController } from './course-grants.controller';
import { CourseGrantsService } from './course-grants.service';

/** Private курс ↔ байгууллага grant-ийн админ API (ticket 46). `AuditService` нь global AdminModule-ээс. */
@Module({
  controllers: [CourseGrantsController],
  providers: [CourseGrantsService],
})
export class CourseGrantsModule {}
