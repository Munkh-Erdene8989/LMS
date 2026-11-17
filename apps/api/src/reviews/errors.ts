import { HttpStatus } from '@nestjs/common';
import { ApiError } from '../auth/errors';

export const ReviewErrors = {
  courseNotFound: () => new ApiError(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Курс олдсонгүй.'),
  notFound: () => new ApiError(HttpStatus.NOT_FOUND, 'REVIEW_NOT_FOUND', 'Үнэлгээ олдсонгүй.'),
  replyNotFound: () => new ApiError(HttpStatus.NOT_FOUND, 'REVIEW_REPLY_NOT_FOUND', 'Хариулт олдсонгүй.'),
  notEligible: (requiredPercent: number) =>
    new ApiError(
      HttpStatus.FORBIDDEN,
      'REVIEW_NOT_ELIGIBLE',
      `Үнэлгээ бичихийн тулд курсийн хичээлүүдийн ядаж ${requiredPercent}%-ийг эзэмшсэн байх шаардлагатай.`,
    ),
  ownCourse: () => new ApiError(HttpStatus.FORBIDDEN, 'REVIEW_OWN_COURSE', 'Өөрийн курсийг үнэлэх боломжгүй.'),
  replyForbidden: () =>
    new ApiError(
      HttpStatus.FORBIDDEN,
      'REVIEW_REPLY_FORBIDDEN',
      'Үнэлгээнд зөвхөн курсийн багш болон үнэлгээ бичсэн хэрэглэгч хариулна.',
    ),
};
