import type { NotificationCategory } from '@lms/shared';

/**
 * Мэдэгдлийн төрөл → хэрэглэгчийн тохируулж болох ангилал. Энд **байхгүй** төрөл (төлбөр, хасагдсан гэх мэт
 * чухал мэдэгдэл) имэйлээр үргэлж явна. Шинэ тохиргоо нэмэхдээ `NOTIFICATION_CATEGORIES`-д ангилал нэмээд
 * энд төрлүүдийг нь холбоно — preference хүснэгт, endpoint, UI-д өөрчлөлт хэрэггүй.
 */
export const NOTIFICATION_TYPE_CATEGORY: Readonly<Record<string, NotificationCategory>> = {
  COMMUNITY_POST_COMMENT: 'COMMUNITY_COMMENT',
  COMMUNITY_THREAD_COMMENT: 'COMMUNITY_COMMENT',
};

export function categoryOf(type: string): NotificationCategory | null {
  return NOTIFICATION_TYPE_CATEGORY[type] ?? null;
}
