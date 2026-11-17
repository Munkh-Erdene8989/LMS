import { HttpStatus } from '@nestjs/common';
import { ApiError } from '../auth/errors';

export const MediaErrors = {
  notVideo: () => new ApiError(HttpStatus.CONFLICT, 'NOT_VIDEO', 'Энэ хичээл видео хичээл биш.'),
  videoNotReady: () =>
    new ApiError(HttpStatus.CONFLICT, 'VIDEO_NOT_READY', 'Видео бэлэн болоогүй байна. Түр хүлээгээд дахин оролдоно уу.'),
  unavailable: () =>
    new ApiError(HttpStatus.SERVICE_UNAVAILABLE, 'VIDEO_UNAVAILABLE', 'Видео үйлчилгээ одоогоор тохируулагдаагүй байна.'),
  provider: () =>
    new ApiError(HttpStatus.BAD_GATEWAY, 'VIDEO_PROVIDER_ERROR', 'Видео үйлчилгээ түр ажиллахгүй байна. Дахин оролдоно уу.'),
  playbackLimit: (max: number) =>
    new ApiError(
      HttpStatus.CONFLICT,
      'PLAYBACK_LIMIT',
      `Таны бүртгэлээр ${max} төхөөрөмж зэрэг видео тоглуулж байна. Нөгөө төхөөрөмж дээр зогсоогоод дахин оролдоно уу.`,
    ),
  invalidSignature: () => new ApiError(HttpStatus.BAD_REQUEST, 'INVALID_SIGNATURE', 'Webhook-ийн гарын үсэг буруу.'),
};
