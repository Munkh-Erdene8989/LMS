import { HttpStatus } from '@nestjs/common';
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
