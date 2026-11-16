import { Module } from '@nestjs/common';
import { AdminTeacherController, TeacherController } from './teacher.controller';
import { TeacherService } from './teacher.service';

@Module({
  controllers: [TeacherController, AdminTeacherController],
  providers: [TeacherService],
  exports: [TeacherService],
})
export class TeacherModule {}
