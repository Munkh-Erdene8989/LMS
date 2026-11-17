import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put, Req } from '@nestjs/common';
import {
  COURSE_LEVELS,
  type CategoryNode,
  type CourseDetail,
  type CourseSummary,
  type ReviewQueueItem,
  type UploadTicket,
} from '@lms/shared';
import type { Request } from 'express';
import { z } from 'zod';
import { Auth, CurrentUser, type CurrentUserInfo } from '../auth/auth.guard';
import { ZodPipe } from '../zod-pipe';
import { CategoryService } from './category.service';
import { CourseAuthoringService } from './course-authoring.service';
import { CourseReviewService } from './course-review.service';

const Uuid = new ParseUUIDPipe();
const title = z.string().trim().min(1).max(200);
const credits = z.number().int().min(0).max(100_000);

const CourseCreate = z.object({ title });
const CourseUpdate = z
  .object({
    title,
    description: z.string().trim().max(20_000),
    categoryId: z.string().uuid().nullable(),
    level: z.enum(COURSE_LEVELS as [string, ...string[]]),
    priceCredits: z.number().int().min(1).max(1_000_000).nullable(),
    coverKey: z.string().max(300).nullable(),
  })
  .partial()
  .strict();
const CoverUpload = z.object({ contentType: z.string().max(100) });
const SectionBody = z.object({ title });
const Curriculum = z.object({
  sections: z.array(z.object({ id: z.string().uuid(), lessonIds: z.array(z.string().uuid()) })),
});
const LessonCreate = z.object({ title, type: z.enum(['VIDEO', 'TEXT', 'PDF', 'QUIZ', 'ASSIGNMENT', 'LIVE']) });
const LessonUpdate = z
  .object({ title, priceCredits: credits, isFreePreview: z.boolean(), content: z.unknown() })
  .partial()
  .strict();
const Reason = z.object({ reason: z.string().trim().min(1).max(2000) });
const CategoryCreate = z.object({ name: z.string().trim().min(1).max(100), parentId: z.string().uuid().nullable().optional() });
const CategoryUpdate = z
  .object({ name: z.string().trim().min(1).max(100), position: z.number().int().min(0).max(10_000) })
  .partial()
  .strict();

/** Багшийн курс засварлах — зөвхөн TEACHER, зөвхөн өөрийн курс. */
@Controller('teacher')
@Auth('TEACHER')
export class TeacherCourseController {
  constructor(private readonly courses: CourseAuthoringService) {}

  @Get('courses')
  list(@CurrentUser() u: CurrentUserInfo): Promise<CourseSummary[]> {
    return this.courses.list(u.id);
  }

  @Post('courses')
  create(@CurrentUser() u: CurrentUserInfo, @Body(new ZodPipe(CourseCreate)) b: z.infer<typeof CourseCreate>): Promise<CourseDetail> {
    return this.courses.create(u.id, b.title);
  }

  @Get('courses/:id')
  detail(@CurrentUser() u: CurrentUserInfo, @Param('id', Uuid) id: string): Promise<CourseDetail> {
    return this.courses.detail(u.id, id);
  }

  @Patch('courses/:id')
  update(
    @CurrentUser() u: CurrentUserInfo,
    @Param('id', Uuid) id: string,
    @Body(new ZodPipe(CourseUpdate)) b: z.infer<typeof CourseUpdate>,
  ): Promise<CourseDetail> {
    return this.courses.update(u.id, id, b as Parameters<CourseAuthoringService['update']>[2]);
  }

  @Delete('courses/:id')
  @HttpCode(204)
  remove(@CurrentUser() u: CurrentUserInfo, @Param('id', Uuid) id: string): Promise<void> {
    return this.courses.remove(u.id, id);
  }

  @Post('courses/:id/cover-upload')
  cover(
    @CurrentUser() u: CurrentUserInfo,
    @Param('id', Uuid) id: string,
    @Body(new ZodPipe(CoverUpload)) b: z.infer<typeof CoverUpload>,
  ): Promise<UploadTicket> {
    return this.courses.coverUpload(u.id, id, b.contentType);
  }

  @Post('courses/:id/sections')
  addSection(
    @CurrentUser() u: CurrentUserInfo,
    @Param('id', Uuid) id: string,
    @Body(new ZodPipe(SectionBody)) b: z.infer<typeof SectionBody>,
  ): Promise<CourseDetail> {
    return this.courses.addSection(u.id, id, b.title);
  }

  @Put('courses/:id/curriculum')
  reorder(
    @CurrentUser() u: CurrentUserInfo,
    @Param('id', Uuid) id: string,
    @Body(new ZodPipe(Curriculum)) b: z.infer<typeof Curriculum>,
  ): Promise<CourseDetail> {
    return this.courses.reorder(u.id, id, b.sections);
  }

  @Post('courses/:id/submit')
  @HttpCode(200)
  submit(@CurrentUser() u: CurrentUserInfo, @Param('id', Uuid) id: string): Promise<CourseDetail> {
    return this.courses.submit(u.id, id);
  }

  @Patch('sections/:id')
  renameSection(
    @CurrentUser() u: CurrentUserInfo,
    @Param('id', Uuid) id: string,
    @Body(new ZodPipe(SectionBody)) b: z.infer<typeof SectionBody>,
  ): Promise<CourseDetail> {
    return this.courses.renameSection(u.id, id, b.title);
  }

  @Delete('sections/:id')
  removeSection(@CurrentUser() u: CurrentUserInfo, @Param('id', Uuid) id: string): Promise<CourseDetail> {
    return this.courses.removeSection(u.id, id);
  }

  @Post('sections/:id/lessons')
  addLesson(
    @CurrentUser() u: CurrentUserInfo,
    @Param('id', Uuid) id: string,
    @Body(new ZodPipe(LessonCreate)) b: z.infer<typeof LessonCreate>,
  ): Promise<CourseDetail> {
    return this.courses.addLesson(u.id, id, b);
  }

  @Patch('lessons/:id')
  updateLesson(
    @CurrentUser() u: CurrentUserInfo,
    @Param('id', Uuid) id: string,
    @Body(new ZodPipe(LessonUpdate)) b: z.infer<typeof LessonUpdate>,
  ): Promise<CourseDetail> {
    return this.courses.updateLesson(u.id, id, b);
  }

  @Delete('lessons/:id')
  removeLesson(@CurrentUser() u: CurrentUserInfo, @Param('id', Uuid) id: string): Promise<CourseDetail> {
    return this.courses.removeLesson(u.id, id);
  }

  @Post('lessons/:id/pdf-upload')
  pdfUpload(@CurrentUser() u: CurrentUserInfo, @Param('id', Uuid) id: string): Promise<UploadTicket> {
    return this.courses.pdfUpload(u.id, id);
  }

  /** Дууссан live хичээлийг бичлэгийн (VIDEO) хичээл болгох (ticket 14). */
  @Post('lessons/:id/convert-to-video')
  @HttpCode(200)
  convertToVideo(@CurrentUser() u: CurrentUserInfo, @Param('id', Uuid) id: string): Promise<CourseDetail> {
    return this.courses.convertLiveToVideo(u.id, id);
  }
}

/** Админ: курсийн шалгалт, ангилал. */
@Controller('admin')
@Auth('ADMIN')
export class AdminCatalogController {
  constructor(
    private readonly reviews: CourseReviewService,
    private readonly categories: CategoryService,
  ) {}

  @Get('course-reviews')
  queue(): Promise<ReviewQueueItem[]> {
    return this.reviews.queue();
  }

  @Get('courses/:id')
  detail(@Param('id', Uuid) id: string): Promise<CourseDetail> {
    return this.reviews.detail(id);
  }

  @Post('courses/:id/approve')
  @HttpCode(200)
  approve(@Param('id', Uuid) id: string, @CurrentUser() a: CurrentUserInfo, @Req() req: Request): Promise<CourseDetail> {
    return this.reviews.approve(id, a.id, req.ip);
  }

  @Post('courses/:id/reject')
  @HttpCode(200)
  reject(
    @Param('id', Uuid) id: string,
    @Body(new ZodPipe(Reason)) b: z.infer<typeof Reason>,
    @CurrentUser() a: CurrentUserInfo,
    @Req() req: Request,
  ): Promise<CourseDetail> {
    return this.reviews.reject(id, b.reason, a.id, req.ip);
  }

  @Post('lessons/:id/reject')
  @HttpCode(200)
  rejectLesson(
    @Param('id', Uuid) id: string,
    @Body(new ZodPipe(Reason)) b: z.infer<typeof Reason>,
    @CurrentUser() a: CurrentUserInfo,
    @Req() req: Request,
  ): Promise<CourseDetail> {
    return this.reviews.rejectLesson(id, b.reason, a.id, req.ip);
  }

  @Post('categories')
  createCategory(
    @Body(new ZodPipe(CategoryCreate)) b: z.infer<typeof CategoryCreate>,
    @CurrentUser() a: CurrentUserInfo,
    @Req() req: Request,
  ): Promise<CategoryNode[]> {
    return this.categories.create(b, a.id, req.ip);
  }

  @Patch('categories/:id')
  updateCategory(
    @Param('id', Uuid) id: string,
    @Body(new ZodPipe(CategoryUpdate)) b: z.infer<typeof CategoryUpdate>,
    @CurrentUser() a: CurrentUserInfo,
    @Req() req: Request,
  ): Promise<CategoryNode[]> {
    return this.categories.update(id, b, a.id, req.ip);
  }

  @Delete('categories/:id')
  removeCategory(@Param('id', Uuid) id: string, @CurrentUser() a: CurrentUserInfo, @Req() req: Request): Promise<CategoryNode[]> {
    return this.categories.remove(id, a.id, req.ip);
  }
}

/** Нийтэд: ангиллын мод. */
@Controller('categories')
export class CategoryController {
  constructor(private readonly categories: CategoryService) {}

  @Get()
  tree(): Promise<CategoryNode[]> {
    return this.categories.tree();
  }
}
