import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import {
  QUIZ_MAX_OPTIONS,
  QUIZ_MAX_QUESTIONS,
  type LessonLearningState,
  type LessonProgressView,
  type MyCourseCard,
  type MyCourseDetail,
  type QuizAttemptResult,
} from '@lms/shared';
import { z } from 'zod';
import { Auth, CurrentUser, type CurrentUserInfo } from '../auth/auth.guard';
import { ZodPipe } from '../zod-pipe';
import { LearningService } from './learning.service';

const Uuid = new ParseUUIDPipe();

const ProgressBody = z.object({ watchedPercent: z.number().min(0).max(100).optional() }).strict();
const AttemptBody = z
  .object({
    answers: z
      .array(z.object({ questionId: z.string().uuid(), optionIds: z.array(z.string().uuid()).max(QUIZ_MAX_OPTIONS) }))
      .max(QUIZ_MAX_QUESTIONS),
  })
  .strict();

/**
 * "Миний сургалт", lesson-ы явц, quiz. Lesson-д хандах эрх `LessonAccessPolicy.open`-оор
 * (эрхгүй бол 403 `LESSON_LOCKED`, нийтэд байхгүй бол 404).
 */
@Controller('learning')
@Auth()
export class LearningController {
  constructor(private readonly learning: LearningService) {}

  @Get('courses')
  myCourses(@CurrentUser() u: CurrentUserInfo): Promise<MyCourseCard[]> {
    return this.learning.myCourses(u.id);
  }

  @Get('courses/:id')
  myCourse(@CurrentUser() u: CurrentUserInfo, @Param('id', Uuid) id: string): Promise<MyCourseDetail> {
    return this.learning.myCourse(u.id, id);
  }

  @Get('lessons/:id')
  lesson(@CurrentUser() u: CurrentUserInfo, @Param('id', Uuid) id: string): Promise<LessonLearningState> {
    return this.learning.lessonState(u, id);
  }

  @Post('lessons/:id/progress')
  @HttpCode(200)
  progress(
    @CurrentUser() u: CurrentUserInfo,
    @Param('id', Uuid) id: string,
    @Body(new ZodPipe(ProgressBody)) b: z.infer<typeof ProgressBody>,
  ): Promise<LessonProgressView> {
    return this.learning.recordProgress(u, id, b.watchedPercent);
  }

  @Post('lessons/:id/complete')
  @HttpCode(200)
  complete(@CurrentUser() u: CurrentUserInfo, @Param('id', Uuid) id: string): Promise<LessonProgressView> {
    return this.learning.complete(u, id);
  }

  @Post('lessons/:id/quiz-attempts')
  submitQuiz(
    @CurrentUser() u: CurrentUserInfo,
    @Param('id', Uuid) id: string,
    @Body(new ZodPipe(AttemptBody)) b: z.infer<typeof AttemptBody>,
  ): Promise<QuizAttemptResult> {
    return this.learning.submitQuiz(u, id, b.answers);
  }
}
