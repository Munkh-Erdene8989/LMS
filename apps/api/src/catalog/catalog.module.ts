import { Module } from '@nestjs/common';
import { AdminCatalogController, CategoryController, TeacherCourseController } from './catalog.controller';
import { CategoryService } from './category.service';
import { CourseAuthoringService } from './course-authoring.service';
import { CourseReviewService } from './course-review.service';
import { LessonAccessPolicy } from './lesson-access';
import { PublicCatalogController } from './public-catalog.controller';
import { PublicCatalogService } from './public-catalog.service';

@Module({
  controllers: [TeacherCourseController, AdminCatalogController, CategoryController, PublicCatalogController],
  providers: [CourseAuthoringService, CourseReviewService, CategoryService, PublicCatalogService, LessonAccessPolicy],
  exports: [CategoryService, LessonAccessPolicy],
})
export class CatalogModule {}
