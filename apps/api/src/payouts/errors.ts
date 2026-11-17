import { HttpStatus } from '@nestjs/common';
import { ApiError } from '../auth/errors';

const mnt = (n: number) => `${n.toLocaleString('en-US')}₮`;

export const PayoutErrors = {
  onHold: () =>
    new ApiError(
      HttpStatus.FORBIDDEN,
      'PAYOUT_ON_HOLD',
      'Таны payout түр зогсоогдсон байна. Дэлгэрэнгүйг админаас лавлана уу.',
    ),
  alreadyOpen: () =>
    new ApiError(HttpStatus.CONFLICT, 'PAYOUT_ALREADY_OPEN', 'Танд шийдвэрлэгдээгүй payout хүсэлт байна.'),
  bankAccountRequired: () =>
    new ApiError(HttpStatus.CONFLICT, 'BANK_ACCOUNT_REQUIRED', 'Payout хүсэхийн өмнө банкны дансаа бүртгүүлнэ үү.'),
  belowMinimum: (minimumMnt: number) =>
    new ApiError(
      HttpStatus.CONFLICT,
      'BELOW_MINIMUM',
      `Үлдэгдэл ${mnt(minimumMnt)}-өөс бага байна. Босгод хүрмэгц payout хүсэх боломжтой.`,
    ),
  notFound: () => new ApiError(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Payout хүсэлт олдсонгүй.'),
  teacherNotFound: () => new ApiError(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Хэрэглэгч олдсонгүй.'),
  notOpen: () =>
    new ApiError(HttpStatus.CONFLICT, 'PAYOUT_NOT_OPEN', 'Энэ хүсэлт аль хэдийн шийдвэрлэгдсэн байна.'),
  heldCannotPay: () =>
    new ApiError(
      HttpStatus.CONFLICT,
      'PAYOUT_ON_HOLD',
      'Энэ багшийн payout hold-той байна. Hold-ыг цуцлах эсвэл хүсэлтийг татгалзана уу.',
    ),
  exceedsBalance: (balanceMnt: number) =>
    new ApiError(
      HttpStatus.CONFLICT,
      'PAYOUT_EXCEEDS_BALANCE',
      `Багшийн одоогийн үлдэгдэл (${mnt(balanceMnt)}) хүсэлтийн дүнгээс бага байна. Хүсэлтийг татгалзана уу.`,
    ),
};
