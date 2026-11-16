# 03: Мэдэгдлийн суурь (in-app + имэйл + дараалал)

**What to build:** Redis + BullMQ дараалал суулгана. Систем хэрэглэгчид in-app мэдэгдэл (хонх) болон имэйлтэй хэрэглэгчид имэйл (Resend) илгээх нэг интерфейстэй болно. Утсаар л бүртгэлтэй хэрэглэгч зөвхөн in-app авна.

**Blocked by:** 02

**Status:** done — Railway Redis холбох үлдсэн (доорх "Үлдсэн")

> Өөрчлөлт: Local-д Redis/Docker байхгүй тул дараалал `JobQueue` interface-ийн ард: `REDIS_URL` байвал BullMQ, үгүй бол process доторх дараалал (dev-д ажлыг шууд гүйцэтгэнэ, cron ажиллахгүй; тестэд гараар `drain()`). BullMQ adapter-ийн тест CI-ийн Redis service container-тэй ажиллана (`queue.bullmq.spec.ts`, local-д алгасна).

- [x] BullMQ дараалал болон cron ажлын суурь (`JobQueue.register/add/schedule`; жишээ cron: өдөр бүр 03:30 хуучин OTP/session цэвэрлэх)
- [x] Нэг notify interface: `NotificationsService.notify()` — in-app бичлэг + (баталгаажсан имэйл байвал) имэйл ажил дараалалд
- [x] Хонх: уншаагүй тоо, жагсаалт (cursor хуудаслалт), уншсан / бүгдийг уншсан гэж тэмдэглэх; web header-т хонх + `/notifications`
- [x] Имэйл загварууд монгол хэлээр, translation-аас (`apps/api/src/i18n/mn.json`; translator `@lms/shared`-д, web ч ашиглана)
- [x] Имэйл илгээлт амжилтгүй бол дахин оролдоно (5 удаа, exponential backoff 30с-ээс); бүрмөсөн бүтэлгүйтвэл `FAILED`, in-app хэвээр
- [x] Integration тест: имэйлгүй хэрэглэгчид имэйл ажил үүсэхгүй (`notifications.spec.ts`, 12 тест)

**Одоогийн мэдэгдлүүд:** `WELCOME` (шинэ бүртгэл), `IDENTIFIER_LINKED` (аюулгүй байдлын мэдэгдэл). Шинэ төрөл нэмэх: `i18n/mn.json` → `notifications.<TYPE>` (title, body, emailSubject), дараа нь `notify({ type: '<TYPE>' })`.

## Үлдсэн

- [ ] Railway дээр Redis үүсгэж `REDIS_URL` тохируулах (production-д заавал — env шалгалт хориглоно). Тэр хүртэл cron ажиллахгүй.
- [ ] CI-г GitHub-д push хийсний дараа BullMQ тест Redis-тэй давж байгааг шалгах.
