import { Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import type { NotificationPage, UnreadCount } from '@lms/shared';
import { z } from 'zod';
import { Auth, CurrentUser, type CurrentUserInfo } from '../auth/auth.guard';
import { ZodPipe } from '../zod-pipe';
import { NotificationsService } from './notifications.service';

const ListQuery = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  before: z.string().uuid().optional(),
});

@Controller('notifications')
@Auth()
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  list(
    @CurrentUser() user: CurrentUserInfo,
    @Query(new ZodPipe(ListQuery)) query: z.infer<typeof ListQuery>,
  ): Promise<NotificationPage> {
    return this.notifications.list(user.id, query);
  }

  @Get('unread-count')
  async unread(@CurrentUser() user: CurrentUserInfo): Promise<UnreadCount> {
    return { count: await this.notifications.unreadCount(user.id) };
  }

  @Post('read-all')
  @HttpCode(204)
  readAll(@CurrentUser() user: CurrentUserInfo): Promise<void> {
    return this.notifications.markAllRead(user.id);
  }

  @Post(':id/read')
  @HttpCode(204)
  read(@CurrentUser() user: CurrentUserInfo, @Param('id', new ParseUUIDPipe()) id: string): Promise<void> {
    return this.notifications.markRead(user.id, id);
  }
}
