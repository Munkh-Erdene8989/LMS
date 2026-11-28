# 45: Байгууллага — админ удирдлага ба урилга

**What to build:** Админ байгууллага үүсгэж/засаж, ажилтан урьж/хасна. Урилга OTP нэвтрэлтээр автоматаар гишүүнчлэл болно. Story 79, 80, 83–86.

**Blocked by:** 44

**Status:** done

## Хийх
- [x] API: байгууллага CRUD (нэр, active, contract_ends_at, seat_limit), жагсаалт (гишүүн/суудал тоо, төлөв). Бүх үйлдэл audit log-т.
- [x] Migration: `organization_invitations` (org, identifier type + normalize хийсэн утга, status `PENDING/ACCEPTED/CANCELED`, invited_at, accepted_at); нэг org-д нэг identifier-ийн pending нэг л байна.
- [x] Урих: нэг нэгээр эсвэл олон мөр (paste) — мөр бүрийн үр дүн (урьсан / аль хэдийн гишүүн / буруу формат / суудал хүрэлцээгүй). Pending + идэвхтэй гишүүд ≤ seat_limit.
- [x] Тухайн identifier аль хэдийн баталгаажсан хэрэглэгчтэй бол тэр дороо гишүүн болгоно.
- [x] Auth hook: OTP нэвтрэлт эсвэл identifier холбох амжилттай болоход тухайн identifier-ийн pending урилгууд → гишүүнчлэл (transaction, idempotent); in-app мэдэгдэл.
- [x] Имэйл урилга: Resend-ээр нэвтрэх линктэй имэйл (notification queue-аар). Утсанд мэдэгдэл явуулахгүй.
- [x] Гишүүн хасах (`removed_at`), pending урилга цуцлах — суудал чөлөөлөгдөнө.
- [x] Web админ: `apps/web/app/admin/organizations` — жагсаалт, үүсгэх/засах, гишүүд + урилгын жагсаалт, урих (paste), хасах/цуцлах (баталгаажуулалттай dialog).
- [x] Integration тест: суудлын хязгаар, урилга → нэвтрэхэд гишүүнчлэл (утас, имэйл), давхар урилга, хасалт суудал чөлөөлөх, дахин урих.

## Шалгах
- typecheck, build, `pnpm test` ногоон.
