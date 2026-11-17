# 22: Админы хэрэглэгчийн удирдлага ба тайлан

**What to build:** Админ хэрэглэгч хайж, хаах, кредитийг шалтгаантай гараар нэмж/хасна. Тайлан: орлого, кредитийн борлуулалт, шилдэг курсууд, test гүйлгээ тусад нь.

**Blocked by:** 09

**Status:** done (API + веб UI); зөвхөн dev schema migration гараар үлдсэн

- [x] Хэрэглэгч хайх (утас, имэйл, нэр), дэлгэрэнгүй (баланс, худалдан авалт)
- [x] Хаах / нээх; хаагдсан хэрэглэгч нэвтрэхгүй
- [x] Кредит гараар засах → `admin_adjust` + шалтгаан + audit
- [x] Тайлан: орлого, кредит борлуулалт, шилдэг курс, багш; `is_test` тусад нь
- [x] Integration тест: гараар засварын ledger, хаагдсан хэрэглэгч

## Хийсэн (API: `apps/api/src/admin-ops/`, `packages/shared/src/admin-ops.ts`, migration `20261117900000_admin_users_reports`)
- `GET /admin/users`, `GET /admin/users/:id`; `POST :id/block|unblock` (tokenVersion нэмж session хүчингүй, refresh/OTP татгалзана, AuthGuard 403 `ACCOUNT_BLOCKED`).
- `POST :id/credits/adjust` (FIFO ledger, 0-оос доош орохгүй), `POST :id/earnings/adjust` (`PayoutsService.adjustEarnings`: payout-той ижил багшийн мөрийн түгжээ, нээлттэй хүсэлтийн түгжигдсэн дүнд хүрэх хасалт 409); шалтгаан заавал, audit, `idempotencyKey` (partial unique index).
- `GET /admin/payments/issues`, `recheck`, `resolve`, `reconcile-canceled`: хуучирсан PENDING, AMOUNT_MISMATCH, карт татагдсан ч олголт унасан, CANCELED-ийн дараа төлөгдсөн.
- `GET /admin/reports/summary`, `/expired-credits`: `is_test` тусдаа.
- Тест: `apps/api/test/admin-users.spec.ts` (17).

## Үлдсэн
- [x] Веб админ UI: `apps/web/app/admin/{users,users/[id],payments,reports}` — хайлт, дэлгэрэнгүй, хаах/нээх, кредит ба орлого засах (idempotencyKey client-д), төлбөрийн тохирол (баталгаажуулалттай), тайлан (test тусдаа).
- [ ] `public` (dev) schema-д migration хэрэгжүүлэх (`pnpm db:deploy`) — гараар.
