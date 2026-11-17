import { Module } from '@nestjs/common';
import { CommunityController, CommunityPostsController, TeacherCommunityController } from './community.controller';
import { CommunityService } from './community.service';

/** Багшийн community (ticket 19): нийтлэл, сэтгэгдэл, like, pin, moderation, live хуанли. */
@Module({
  controllers: [CommunityController, CommunityPostsController, TeacherCommunityController],
  providers: [CommunityService],
})
export class CommunityModule {}
