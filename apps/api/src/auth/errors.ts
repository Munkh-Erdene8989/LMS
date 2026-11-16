import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * API-ийн алдааны нэгдсэн хэлбэр: `{ code, message }`.
 * `code` нь client-ийн логикт, `message` нь хэрэглэгчид харуулахад.
 */
export class ApiError extends HttpException {
  constructor(status: HttpStatus, code: string, message: string) {
    super({ code, message }, status);
  }
}

export const AuthErrors = {
  invalidIdentifier: () => new ApiError(HttpStatus.BAD_REQUEST, 'INVALID_IDENTIFIER', 'Утас эсвэл имэйл буруу байна.'),
  rateLimited: () =>
    new ApiError(HttpStatus.TOO_MANY_REQUESTS, 'RATE_LIMITED', 'Хэт олон оролдлого. Түр хүлээгээд дахин оролдоно уу.'),
  challengeNotFound: () => new ApiError(HttpStatus.NOT_FOUND, 'OTP_NOT_FOUND', 'Баталгаажуулалт олдсонгүй.'),
  otpExpired: () => new ApiError(HttpStatus.GONE, 'OTP_EXPIRED', 'Кодын хугацаа дууссан. Шинэ код авна уу.'),
  otpUsed: () => new ApiError(HttpStatus.GONE, 'OTP_USED', 'Энэ код аль хэдийн ашиглагдсан.'),
  invalidCode: () => new ApiError(HttpStatus.BAD_REQUEST, 'INVALID_CODE', 'Код буруу байна.'),
  tooManyAttempts: () =>
    new ApiError(HttpStatus.TOO_MANY_REQUESTS, 'TOO_MANY_ATTEMPTS', 'Хэт олон буруу оролдлого. Шинэ код авна уу.'),
  codeRequired: () => new ApiError(HttpStatus.BAD_REQUEST, 'CODE_REQUIRED', 'Код оруулна уу.'),
  identifierTaken: () =>
    new ApiError(HttpStatus.CONFLICT, 'IDENTIFIER_TAKEN', 'Энэ утас/имэйл өөр бүртгэлд холбогдсон байна.'),
  alreadyLinked: () =>
    new ApiError(HttpStatus.CONFLICT, 'ALREADY_LINKED', 'Таны бүртгэлд энэ төрлийн identifier аль хэдийн холбогдсон.'),
  providerUnavailable: () =>
    new ApiError(HttpStatus.BAD_GATEWAY, 'PROVIDER_UNAVAILABLE', 'Баталгаажуулах үйлчилгээ түр ажиллахгүй байна.'),
  unauthenticated: () => new ApiError(HttpStatus.UNAUTHORIZED, 'UNAUTHENTICATED', 'Нэвтэрнэ үү.'),
  forbidden: () => new ApiError(HttpStatus.FORBIDDEN, 'FORBIDDEN', 'Танд энэ үйлдлийг хийх эрх алга.'),
  refreshInvalid: () => new ApiError(HttpStatus.UNAUTHORIZED, 'REFRESH_INVALID', 'Дахин нэвтэрнэ үү.'),
};
