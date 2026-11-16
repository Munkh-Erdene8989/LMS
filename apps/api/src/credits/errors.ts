import { HttpStatus } from '@nestjs/common';
import { ApiError } from '../auth/errors';

export const CreditErrors = {
  insufficient: (balance: number, required: number) =>
    new ApiError(
      HttpStatus.CONFLICT,
      'INSUFFICIENT_CREDITS',
      `Кредит хүрэлцэхгүй байна (үлдэгдэл ${balance}, шаардлагатай ${required}). Кредит цэнэглэнэ үү.`,
    ),
  invalidAmount: () => new ApiError(HttpStatus.BAD_REQUEST, 'INVALID_AMOUNT', 'Кредитийн тоо эерэг бүхэл тоо байх ёстой.'),
  userNotFound: () => new ApiError(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Хэрэглэгч олдсонгүй.'),
  packageNotFound: () => new ApiError(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Кредит багц олдсонгүй.'),
  packageInUse: () =>
    new ApiError(
      HttpStatus.CONFLICT,
      'PACKAGE_IN_USE',
      'Энэ багцаар төлбөр хийгдсэн тул устгах боломжгүй. Идэвхгүй болгоно уу.',
    ),
  paymentNotFound: () => new ApiError(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Төлбөр олдсонгүй.'),
  providerUnavailable: () =>
    new ApiError(
      HttpStatus.BAD_GATEWAY,
      'PAYMENT_PROVIDER_UNAVAILABLE',
      'QPay түр ажиллахгүй байна. Хэсэг хугацааны дараа дахин оролдоно уу.',
    ),
};
