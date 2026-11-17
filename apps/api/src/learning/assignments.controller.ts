import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import {
  ASSIGNMENT_COMMENT_MAX,
  ASSIGNMENT_MAX_SCORE_LIMIT,
  ASSIGNMENT_TEXT_MAX,
  type AssignmentInboxItem,
  type AssignmentInboxPage,
  type AssignmentState,
  type SubmissionFileUrl,
  type UploadTicket,
} from '@lms/shared';
import { z } from 'zod';
import { Auth, CurrentUser, type CurrentUserInfo } from '../auth/auth.guard';
import { ZodPipe } from '../zod-pipe';
import { AssignmentsService } from './assignments.service';

const Uuid = new ParseUUIDPipe();

const UploadBody = z
  .object({ fileName: z.string().trim().min(1).max(200), size: z.number().int().min(0) })
  .strict();
const SubmitBody = z
  .object({
    text: z.string().max(ASSIGNMENT_TEXT_MAX).optional(),
    file: z.object({ key: z.string().min(1).max(300), name: z.string().trim().min(1).max(200) }).strict().optional(),
  })
  .strict();
const InboxQuery = z.object({
  status: z.enum(['UNREVIEWED', 'REVIEWED']).default('UNREVIEWED'),
  courseId: z.string().uuid().optional(),
  before: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
});
const ReviewBody = z
  .object({
    score: z.number().int().min(0).max(ASSIGNMENT_MAX_SCORE_LIMIT),
    comment: z.string().max(ASSIGNMENT_COMMENT_MAX).optional(),
  })
  .strict();

/** Суралцагч: даалгавар илгээх (зөвхөн эзэмшигч), файлаа татах. Төлөв `GET /learning/lessons/:id`-ийн `assignment`. */
@Controller('learning')
@Auth()
export class LearnerAssignmentsController {
  constructor(private readonly assignments: AssignmentsService) {}

  @Post('lessons/:id/assignment/upload')
  upload(
    @CurrentUser() u: CurrentUserInfo,
    @Param('id', Uuid) id: string,
    @Body(new ZodPipe(UploadBody)) b: z.infer<typeof UploadBody>,
  ): Promise<UploadTicket> {
    return this.assignments.uploadTicket(u, id, b);
  }

  @Post('lessons/:id/assignment/submissions')
  submit(
    @CurrentUser() u: CurrentUserInfo,
    @Param('id', Uuid) id: string,
    @Body(new ZodPipe(SubmitBody)) b: z.infer<typeof SubmitBody>,
  ): Promise<AssignmentState> {
    return this.assignments.submit(u, id, b);
  }

  /** Илгээгч, курсийн багш, админ (бусдад 404). */
  @Get('assignment-submissions/:id/file')
  file(@CurrentUser() u: CurrentUserInfo, @Param('id', Uuid) id: string): Promise<SubmissionFileUrl> {
    return this.assignments.fileUrl(u, id);
  }
}

/** Багшийн шалгах inbox — зөвхөн өөрийн курсийн илгээлтүүд. */
@Controller('teacher/assignments')
@Auth('TEACHER')
export class TeacherAssignmentsController {
  constructor(private readonly assignments: AssignmentsService) {}

  @Get()
  inbox(@CurrentUser() u: CurrentUserInfo, @Query(new ZodPipe(InboxQuery)) q: z.infer<typeof InboxQuery>): Promise<AssignmentInboxPage> {
    return this.assignments.inbox(u.id, q);
  }

  @Post(':id/review')
  @HttpCode(200)
  review(
    @CurrentUser() u: CurrentUserInfo,
    @Param('id', Uuid) id: string,
    @Body(new ZodPipe(ReviewBody)) b: z.infer<typeof ReviewBody>,
  ): Promise<AssignmentInboxItem> {
    return this.assignments.review(u.id, id, b);
  }
}
