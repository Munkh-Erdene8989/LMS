import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { isIsoDate, type CourseVideoAnalyticsView, type TeacherAnalyticsView } from '@lms/shared';
import { z } from 'zod';
import { Auth, CurrentUser, type CurrentUserInfo } from '../auth/auth.guard';
import { ZodPipe } from '../zod-pipe';
import { AnalyticsService } from './analytics.service';

const IsoDate = z.string().refine(isIsoDate, 'YYYY-MM-DD огноо байх ёстой');

/** `from`, `to` — Улаанбаатарын огноо (хоёулаа орно) */
const RangeQuery = z.object({
  from: IsoDate.optional(),
  to: IsoDate.optional(),
  granularity: z.enum(['day', 'month']).default('day'),
});
type RangeQuery = z.infer<typeof RangeQuery>;

/** Багшийн аналитик (ticket 21) — зөвхөн өөрийн курс, худалдан авалт. */
@Controller('teacher/analytics')
@Auth('TEACHER')
export class TeacherAnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get()
  overview(@CurrentUser() u: CurrentUserInfo, @Query(new ZodPipe(RangeQuery)) q: RangeQuery): Promise<TeacherAnalyticsView> {
    return this.analytics.overview(u.id, q);
  }

  @Get('courses/:id/video')
  video(
    @CurrentUser() u: CurrentUserInfo,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query(new ZodPipe(RangeQuery)) q: RangeQuery,
  ): Promise<CourseVideoAnalyticsView> {
    return this.analytics.courseVideo(u.id, id, q);
  }
}
