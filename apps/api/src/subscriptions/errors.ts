import { HttpStatus } from '@nestjs/common';
import { ApiError } from '../auth/errors';

const STATUS_MN: Record<string, string> = {
  INCOMPLETE: 'төлбөр хүлээгдэж буй',
  ACTIVE: 'идэвхтэй',
  PAST_DUE: 'төлбөр хоцорсон',
  PAUSED: 'түр зогссон',
  CANCELED: 'цуцлагдсан',
};

const ACTION_MN: Record<string, string> = {
  start: 'бүртгүүлэх',
  reactivate: 'дахин идэвхжүүлэх',
  cancel: 'цуцлах',
  pay: 'төлөх',
};

export const SubscriptionErrors = {
  planNotFound: () => new ApiError(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Сарын багц олдсонгүй.'),
  planInUse: () =>
    new ApiError(
      HttpStatus.CONFLICT,
      'PLAN_IN_USE',
      'Энэ багцад бүртгэл эсвэл төлбөр холбогдсон тул устгах боломжгүй. Идэвхгүй болгоно уу.',
    ),
  notFound: () => new ApiError(HttpStatus.NOT_FOUND, 'SUBSCRIPTION_NOT_FOUND', 'Сарын багцын бүртгэл алга.'),
  invalidAction: (action: string, status: string) =>
    new ApiError(
      HttpStatus.CONFLICT,
      'INVALID_SUBSCRIPTION_TRANSITION',
      `Сарын багц ${STATUS_MN[status] ?? status} төлөвтэй үед ${ACTION_MN[action] ?? action} боломжгүй.`,
    ),
  invalidTransition: (from: string, to: string) =>
    new ApiError(
      HttpStatus.CONFLICT,
      'INVALID_SUBSCRIPTION_TRANSITION',
      `Сарын багцын төлөв ${STATUS_MN[from] ?? from} → ${STATUS_MN[to] ?? to} шилжих боломжгүй.`,
    ),
  busy: () =>
    new ApiError(HttpStatus.CONFLICT, 'SUBSCRIPTION_BUSY', 'Өөр хүсэлт боловсруулагдаж байна. Дахин оролдоно уу.'),
  cardNotSupported: () =>
    new ApiError(HttpStatus.CONFLICT, 'CARD_NOT_SUPPORTED', 'Карт холбох боломж одоогоор алга. QPay нэхэмжлэхээр төлнө үү.'),
  cardAlreadyLinked: () =>
    new ApiError(HttpStatus.CONFLICT, 'CARD_ALREADY_LINKED', 'Карт аль хэдийн холбогдсон. Эхлээд салгана уу.'),
  cardNotFound: () => new ApiError(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Холбосон карт алга.'),
};
