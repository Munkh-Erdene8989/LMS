import { Module } from '@nestjs/common';
import { AdminReviewsController, ReviewsController } from './reviews.controller';
import { ReviewsService } from './reviews.service';

/** Үнэлгээ ба сэтгэгдэл (ticket 18). Каталогийн дундаж үнэлгээ `catalog/ratings.ts`-ээс (энэ модулийн хүснэгт). */
@Module({
  controllers: [ReviewsController, AdminReviewsController],
  providers: [ReviewsService],
})
export class ReviewsModule {}
