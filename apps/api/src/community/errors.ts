import { HttpStatus } from '@nestjs/common';
import { COMMUNITY_IMAGE_MAX_BYTES, COMMUNITY_PIN_MAX } from '@lms/shared';
import { ApiError } from '../auth/errors';

export const CommunityErrors = {
  notFound: () => new ApiError(HttpStatus.NOT_FOUND, 'COMMUNITY_NOT_FOUND', 'Community олдсонгүй.'),
  membersOnly: () =>
    new ApiError(
      HttpStatus.FORBIDDEN,
      'COMMUNITY_MEMBERS_ONLY',
      'Энэ community-д зөвхөн багшийн хичээлийг худалдаж авсан суралцагчид нэгдэнэ.',
    ),
  removed: () => new ApiError(HttpStatus.FORBIDDEN, 'COMMUNITY_REMOVED', 'Багш таныг энэ community-гоос хассан байна.'),
  teacherOnly: () => new ApiError(HttpStatus.FORBIDDEN, 'COMMUNITY_TEACHER_ONLY', 'Энэ үйлдлийг зөвхөн community-ийн багш хийнэ.'),
  postNotFound: () => new ApiError(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Нийтлэл олдсонгүй.'),
  commentNotFound: () => new ApiError(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Сэтгэгдэл олдсонгүй.'),
  emptyPost: () => new ApiError(HttpStatus.BAD_REQUEST, 'EMPTY_POST', 'Нийтлэлдээ текст бичих эсвэл зураг хавсаргана уу.'),
  emptyComment: () => new ApiError(HttpStatus.BAD_REQUEST, 'EMPTY_COMMENT', 'Сэтгэгдэл хоосон байна.'),
  imageTooLarge: () =>
    new ApiError(HttpStatus.BAD_REQUEST, 'IMAGE_TOO_LARGE', `Зураг ${COMMUNITY_IMAGE_MAX_BYTES / 1024 / 1024}MB-аас ихгүй байх ёстой.`),
  invalidImage: (reason: string) => new ApiError(HttpStatus.BAD_REQUEST, 'INVALID_IMAGE', reason),
  pinLimit: () =>
    new ApiError(HttpStatus.CONFLICT, 'PIN_LIMIT', `Зэрэг ${COMMUNITY_PIN_MAX}-аас олон нийтлэл pin хийхгүй. Эхлээд нэгийг нь болиулна уу.`),
  alreadyHidden: () => new ApiError(HttpStatus.CONFLICT, 'ALREADY_HIDDEN', 'Аль хэдийн нуусан байна.'),
  notHidden: () => new ApiError(HttpStatus.CONFLICT, 'NOT_HIDDEN', 'Нуугдаагүй байна.'),
  forbidden: () => new ApiError(HttpStatus.FORBIDDEN, 'FORBIDDEN', 'Танд энэ үйлдлийг хийх эрх алга.'),
  memberNotFound: () => new ApiError(HttpStatus.NOT_FOUND, 'MEMBER_NOT_FOUND', 'Энэ хэрэглэгч таны community-ийн гишүүн биш.'),
};
