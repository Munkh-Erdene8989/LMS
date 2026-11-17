import { HttpStatus } from '@nestjs/common';
import { ApiError } from '../auth/errors';

export const LearningErrors = {
  courseNotFound: () => new ApiError(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Курс олдсонгүй.'),
  notAQuiz: () => new ApiError(HttpStatus.BAD_REQUEST, 'NOT_A_QUIZ', 'Энэ хичээл quiz биш.'),
  completionNotManual: () =>
    new ApiError(
      HttpStatus.CONFLICT,
      'COMPLETION_NOT_MANUAL',
      'Энэ төрлийн хичээл автоматаар дуусна (видео — үзэж дуусгах, quiz — тэнцэх).',
    ),
  invalidAnswers: () => new ApiError(HttpStatus.BAD_REQUEST, 'INVALID_ANSWERS', 'Хариулт quiz-ийн асуулттай таарахгүй байна.'),
};

export const CertificateErrors = {
  courseNotFound: LearningErrors.courseNotFound,
  certificateNotFound: () => new ApiError(HttpStatus.NOT_FOUND, 'CERTIFICATE_NOT_FOUND', 'Ийм кодтой сертификат олдсонгүй.'),
  notEligible: () =>
    new ApiError(
      HttpStatus.CONFLICT,
      'CERTIFICATE_NOT_ELIGIBLE',
      'Сертификат авах нөхцөл хангагдаагүй байна: курсийг бүтнээр нь авч, бүх хичээлийг дуусгаж, тестийн дундаж оноо 70%-иас багагүй байх ёстой.',
    ),
  nameRequired: () =>
    new ApiError(HttpStatus.CONFLICT, 'NAME_REQUIRED', 'Сертификат дээр нэр бичигдэнэ. Эхлээд профайлдаа нэрээ оруулна уу.'),
};
