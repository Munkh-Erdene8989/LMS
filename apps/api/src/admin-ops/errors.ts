import { HttpStatus } from '@nestjs/common';
import { ApiError } from '../auth/errors';

export const AdminOpsErrors = {
  userNotFound: () => new ApiError(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Хэрэглэгч олдсонгүй.'),
  cannotBlockSelf: () => new ApiError(HttpStatus.CONFLICT, 'CANNOT_BLOCK_SELF', 'Өөрийгөө хаах боломжгүй.'),
  paymentNotFound: () => new ApiError(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Төлбөр олдсонгүй.'),
  notResolvable: (why: string) => new ApiError(HttpStatus.CONFLICT, 'PAYMENT_NOT_RESOLVABLE', why),
  /** Шийдэх зуур төлбөрийн төлөв өөрчлөгдсөн (callback/cron түрүүлсэн г.м) — хуудсыг шинэчилнэ */
  stateChanged: () =>
    new ApiError(
      HttpStatus.CONFLICT,
      'PAYMENT_STATE_CHANGED',
      'Төлбөрийн төлөв өөрчлөгдсөн байна (жишээ нь төлөгдөж кредит олгогдсон). Жагсаалтыг шинэчилнэ үү.',
    ),
  invalidRange: () =>
    new ApiError(HttpStatus.BAD_REQUEST, 'INVALID_RANGE', 'Огнооны муж буруу (эхлэх ≤ дуусах, 366 хоногоос ихгүй).'),
};
