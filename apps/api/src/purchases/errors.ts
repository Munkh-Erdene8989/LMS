import { HttpStatus } from '@nestjs/common';
import { ApiError } from '../auth/errors';

export const PurchaseErrors = {
  lessonNotFound: () => new ApiError(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Хичээл олдсонгүй.'),
  courseNotFound: () => new ApiError(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Курс олдсонгүй.'),
  notForSale: () =>
    new ApiError(HttpStatus.CONFLICT, 'COURSE_NOT_FOR_SALE', 'Энэ курсийг бүтнээр нь худалдаж авах боломжгүй. Хичээлээр нь авна уу.'),
  ownCourse: () =>
    new ApiError(HttpStatus.FORBIDDEN, 'OWN_COURSE', 'Өөрийн курсийг худалдаж авах шаардлагагүй — та бүх хичээлийг үзэх эрхтэй.'),
  alreadyOwned: () => new ApiError(HttpStatus.CONFLICT, 'ALREADY_OWNED', 'Та үүнийг аль хэдийн худалдаж авсан байна.'),
  priceChanged: (credits: number) =>
    new ApiError(
      HttpStatus.CONFLICT,
      'PRICE_CHANGED',
      `Үнэ өөрчлөгдсөн байна (одоогийн үнэ ${credits} кредит). Шинэ үнийг шалгаад дахин баталгаажуулна уу.`,
    ),
  noRefundNotConfirmed: () =>
    new ApiError(
      HttpStatus.BAD_REQUEST,
      'NO_REFUND_NOT_CONFIRMED',
      'Худалдан авалт буцаагдахгүй гэдгийг баталгаажуулна уу.',
    ),
  identifierRequired: () =>
    new ApiError(
      HttpStatus.FORBIDDEN,
      'IDENTIFIER_REQUIRED',
      'Худалдан авалт хийхийн өмнө утас эсвэл имэйлээ баталгаажуулна уу.',
    ),
};
