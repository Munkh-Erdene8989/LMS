import { HttpStatus } from '@nestjs/common';
import { formatUbDateTime, QUIZ_ATTEMPT_COOLDOWN_SECONDS, QUIZ_ATTEMPTS_PER_DAY } from '@lms/shared';
import { ApiError } from '../auth/errors';

export const LearningErrors = {
  courseNotFound: () => new ApiError(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Курс олдсонгүй.'),
  notAQuiz: () => new ApiError(HttpStatus.BAD_REQUEST, 'NOT_A_QUIZ', 'Энэ хичээл quiz биш.'),
  completionNotManual: () =>
    new ApiError(
      HttpStatus.CONFLICT,
      'COMPLETION_NOT_MANUAL',
      'Энэ төрлийн хичээл автоматаар дуусна (видео — үзэж дуусгах, quiz — тэнцэх, даалгавар — илгээх).',
    ),
  invalidAnswers: () => new ApiError(HttpStatus.BAD_REQUEST, 'INVALID_ANSWERS', 'Хариулт quiz-ийн асуулттай таарахгүй байна.'),
  quizRateLimited: (nextAt: Date, now = new Date()) => {
    const waitSeconds = Math.max(1, Math.ceil((nextAt.getTime() - now.getTime()) / 1000));
    const message =
      waitSeconds <= QUIZ_ATTEMPT_COOLDOWN_SECONDS
        ? `Дахин оролдохын өмнө түр хүлээнэ үү — ${waitSeconds} секундын дараа боломжтой.`
        : `Энэ тестийг 24 цагт ${QUIZ_ATTEMPTS_PER_DAY} удаа л бөглөнө. Дараагийн оролдлого: ${formatUbDateTime(nextAt.toISOString())} (Улаанбаатарын цагаар).`;
    return new ApiError(HttpStatus.TOO_MANY_REQUESTS, 'QUIZ_RATE_LIMITED', message);
  },

  // ---- даалгавар (ticket 13) ----
  notAnAssignment: () => new ApiError(HttpStatus.BAD_REQUEST, 'NOT_AN_ASSIGNMENT', 'Энэ хичээл даалгавар биш.'),
  assignmentOwnersOnly: () =>
    new ApiError(HttpStatus.FORBIDDEN, 'ASSIGNMENT_OWNERS_ONLY', 'Даалгаврыг зөвхөн хичээлийг худалдаж авсан суралцагч илгээнэ.'),
  emptySubmission: () => new ApiError(HttpStatus.BAD_REQUEST, 'EMPTY_SUBMISSION', 'Хариултаа текстээр бичих эсвэл файл хавсаргана уу.'),
  fileTooLarge: () => new ApiError(HttpStatus.BAD_REQUEST, 'FILE_TOO_LARGE', 'Файл 50MB-аас ихгүй байх ёстой.'),
  invalidUpload: (reason: string) => new ApiError(HttpStatus.BAD_REQUEST, 'INVALID_UPLOAD', reason),
  submissionConflict: () =>
    new ApiError(HttpStatus.CONFLICT, 'SUBMISSION_CONFLICT', 'Өөр илгээлт зэрэг хийгдлээ. Хуудсаа шинэчлээд дахин оролдоно уу.'),
  submissionNotFound: () => new ApiError(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Илгээлт олдсонгүй.'),
  invalidScore: (max: number) => new ApiError(HttpStatus.BAD_REQUEST, 'INVALID_SCORE', `Оноо 0–${max} хооронд байна.`),
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
