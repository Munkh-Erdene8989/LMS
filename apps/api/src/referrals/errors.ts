import { HttpStatus } from '@nestjs/common';
import { ApiError } from '../auth/errors';

export const ReferralErrors = {
  notFound: () => new ApiError(HttpStatus.NOT_FOUND, 'REFERRAL_NOT_FOUND', 'Referral линк олдсонгүй.'),
};
