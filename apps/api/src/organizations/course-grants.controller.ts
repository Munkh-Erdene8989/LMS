import { Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Req } from '@nestjs/common';
import type { CourseGrantOrgView, OrgCourseGrantView, PrivateCourseOption } from '@lms/shared';
import type { Request } from 'express';
import { Auth, CurrentUser, type CurrentUserInfo } from '../auth/auth.guard';
import { CourseGrantsService } from './course-grants.service';

const Uuid = new ParseUUIDPipe();

/** Private курсийг байгууллагад олгох — зөвхөн ADMIN (ticket 46). */
@Controller('admin')
@Auth('ADMIN')
export class CourseGrantsController {
  constructor(private readonly grants: CourseGrantsService) {}

  @Get('private-courses')
  privateCourses(): Promise<PrivateCourseOption[]> {
    return this.grants.listPrivateCourses();
  }

  @Get('organizations/:id/courses')
  forOrganization(@Param('id', Uuid) id: string): Promise<OrgCourseGrantView[]> {
    return this.grants.listForOrganization(id);
  }

  @Post('organizations/:id/courses/:courseId')
  @HttpCode(200)
  grant(
    @Param('id', Uuid) id: string,
    @Param('courseId', Uuid) courseId: string,
    @CurrentUser() a: CurrentUserInfo,
    @Req() req: Request,
  ): Promise<OrgCourseGrantView> {
    return this.grants.grant(id, courseId, a.id, req.ip);
  }

  @Delete('organizations/:id/courses/:courseId')
  @HttpCode(204)
  async revoke(
    @Param('id', Uuid) id: string,
    @Param('courseId', Uuid) courseId: string,
    @CurrentUser() a: CurrentUserInfo,
    @Req() req: Request,
  ): Promise<void> {
    await this.grants.revoke(id, courseId, a.id, req.ip);
  }

  @Get('courses/:id/organizations')
  forCourse(@Param('id', Uuid) id: string): Promise<CourseGrantOrgView[]> {
    return this.grants.listForCourse(id);
  }
}
