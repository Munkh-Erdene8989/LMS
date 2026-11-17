import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { NOTIFICATION_CATEGORIES, type NotificationCategory, type NotificationPage, type NotificationPreferenceView, type UnreadCount } from '@lms/shared';
import { z } from 'zod';
import { Auth, CurrentUser, type CurrentUserInfo } from '../auth/auth.guard';
import { ZodPipe } from '../zod-pipe';
import { NotificationsService } from './notifications.service';

const ListQuery = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  before: z.string().uuid().optional(),
});

const PreferenceBody = z.object({ emailEnabled: z.boolean() }).strict();
const CategoryParam = new ZodPipe(z.enum(NOTIFICATION_CATEGORIES));

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

  /** Имэйл мэдэгдлийн тохиргоо (ангилалаар). In-app мэдэгдэл үргэлж ирнэ. */
  @Get('preferences')
  preferences(@CurrentUser() user: CurrentUserInfo): Promise<NotificationPreferenceView[]> {
    return this.notifications.preferences(user.id);
  }

  @Put('preferences/:category')
  setPreference(
    @CurrentUser() user: CurrentUserInfo,
    @Param('category', CategoryParam) category: NotificationCategory,
    @Body(new ZodPipe(PreferenceBody)) body: z.infer<typeof PreferenceBody>,
  ): Promise<NotificationPreferenceView> {
    return this.notifications.setPreference(user.id, category, body.emailEnabled);
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
