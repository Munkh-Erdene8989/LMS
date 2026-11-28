import { HttpStatus } from '@nestjs/common';
import { ApiError } from '../auth/errors';

export const OrgErrors = {
  notFound: () => new ApiError(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Байгууллага олдсонгүй.'),
  memberNotFound: () => new ApiError(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Гишүүн олдсонгүй эсвэл аль хэдийн хасагдсан.'),
  invitationNotFound: () => new ApiError(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Хүлээгдэж буй урилга олдсонгүй.'),
  noEntries: () => new ApiError(HttpStatus.BAD_REQUEST, 'NO_ENTRIES', 'Утас эсвэл имэйл оруулна уу.'),
  tooManyEntries: (max: number) =>
    new ApiError(HttpStatus.BAD_REQUEST, 'TOO_MANY_ENTRIES', `Нэг удаад ${max}-аас илүүгүй мөр урина уу.`),
};
