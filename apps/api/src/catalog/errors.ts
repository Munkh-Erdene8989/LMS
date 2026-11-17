import { HttpStatus } from '@nestjs/common';
import { ApiError } from '../auth/errors';

export const CatalogErrors = {
  courseNotFound: () => new ApiError(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Курс олдсонгүй.'),
  sectionNotFound: () => new ApiError(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Бүлэг олдсонгүй.'),
  lessonNotFound: () => new ApiError(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Хичээл олдсонгүй.'),
  categoryNotFound: () => new ApiError(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Ангилал олдсонгүй.'),
  teacherNotFound: () => new ApiError(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Багш олдсонгүй.'),
  lessonLocked: () =>
    new ApiError(HttpStatus.FORBIDDEN, 'LESSON_LOCKED', 'Энэ хичээлийг үзэхийн тулд худалдаж авна уу.'),
  courseInReview: () =>
    new ApiError(HttpStatus.CONFLICT, 'COURSE_IN_REVIEW', 'Курс шалгагдаж байгаа тул засах боломжгүй.'),
  lessonInReview: () =>
    new ApiError(HttpStatus.CONFLICT, 'LESSON_IN_REVIEW', 'Хичээл шалгагдаж байгаа тул засах боломжгүй.'),
  contentLocked: () =>
    new ApiError(
      HttpStatus.CONFLICT,
      'LESSON_CONTENT_LOCKED',
      'Нийтлэгдсэн хичээлийн агуулгыг засах боломжгүй (худалдан авсан суралцагчид бий). Шинэ хичээл нэмнэ үү.',
    ),
  typeChangeForbidden: () =>
    new ApiError(HttpStatus.BAD_REQUEST, 'CONTENT_TYPE_MISMATCH', 'Агуулга хичээлийн төрөлтэй таарахгүй байна.'),
  lessonTypeUnavailable: () =>
    new ApiError(HttpStatus.BAD_REQUEST, 'LESSON_TYPE_UNAVAILABLE', 'Энэ төрлийн хичээл удахгүй нэмэгдэнэ.'),
  sectionNotEmpty: () =>
    new ApiError(HttpStatus.CONFLICT, 'SECTION_NOT_EMPTY', 'Бүлэгт хичээл байгаа тул устгах боломжгүй.'),
  courseNotDeletable: () =>
    new ApiError(HttpStatus.CONFLICT, 'COURSE_NOT_DELETABLE', 'Нийтлэгдсэн эсвэл шалгагдаж буй курсийг устгах боломжгүй.'),
  invalidCurriculum: () =>
    new ApiError(HttpStatus.BAD_REQUEST, 'INVALID_CURRICULUM', 'Бүлэг, хичээлийн жагсаалт курстэй таарахгүй байна.'),
  notReady: (problems: string[]) =>
    new ApiError(HttpStatus.BAD_REQUEST, 'NOT_READY', `Илгээхэд дутуу: ${problems.join('; ')}`),
  nothingToSubmit: () =>
    new ApiError(HttpStatus.CONFLICT, 'NOTHING_TO_SUBMIT', 'Шалгуулах шинэ хичээл алга.'),
  invalidStatus: () =>
    new ApiError(HttpStatus.CONFLICT, 'INVALID_STATUS', 'Курс энэ үйлдэлд тохирох төлөвт биш байна.'),
  invalidUpload: (reason: string) => new ApiError(HttpStatus.BAD_REQUEST, 'INVALID_UPLOAD', reason),
  invalidLive: (reason: string) => new ApiError(HttpStatus.BAD_REQUEST, 'INVALID_LIVE', reason),
  liveStartInPast: () =>
    new ApiError(HttpStatus.BAD_REQUEST, 'LIVE_START_IN_PAST', 'Эхлэх цаг ирээдүйд байх ёстой.'),
  notLive: () => new ApiError(HttpStatus.CONFLICT, 'NOT_LIVE', 'Энэ хичээл шууд (live) хичээл биш.'),
  liveNotEnded: () =>
    new ApiError(HttpStatus.CONFLICT, 'LIVE_NOT_ENDED', 'Шууд хичээл дуусаагүй тул бичлэг болгох боломжгүй.'),
  categoryDepth: () =>
    new ApiError(HttpStatus.BAD_REQUEST, 'CATEGORY_DEPTH', 'Ангилал зөвхөн 2 түвшинтэй байна.'),
  categoryInUse: () =>
    new ApiError(HttpStatus.CONFLICT, 'CATEGORY_IN_USE', 'Ангилалд курс эсвэл дэд ангилал байгаа тул устгах боломжгүй.'),
};
