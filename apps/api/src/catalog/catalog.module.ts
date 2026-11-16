import { Module } from '@nestjs/common';
import { AdminCatalogController, CategoryController, TeacherCourseController } from './catalog.controller';
import { CategoryService } from './category.service';
import { CourseAuthoringService } from './course-authoring.service';
import { CourseReviewService } from './course-review.service';

@Module({
  controllers: [TeacherCourseController, AdminCatalogController, CategoryController],
  providers: [CourseAuthoringService, CourseReviewService, CategoryService],
  exports: [CategoryService],
})
export class CatalogModule {}
