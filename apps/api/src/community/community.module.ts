import { Module } from '@nestjs/common';
import { AdminCommunityController, CommunityController, CommunityPostsController, TeacherCommunityController } from './community.controller';
import { CommunityService } from './community.service';

/** Багшийн community (ticket 19): нийтлэл, сэтгэгдэл, like, pin, moderation, live хуанли. */
@Module({
  controllers: [CommunityController, CommunityPostsController, TeacherCommunityController, AdminCommunityController],
  providers: [CommunityService],
})
export class CommunityModule {}
