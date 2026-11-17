# 18: Үнэлгээ ба сэтгэгдэл

**What to build:** Курсийн lesson-уудын ≥30%-ийг эзэмшсэн хэрэглэгч 1–5 одоор үнэлж, сэтгэгдэл бичнэ (нэг курст нэг удаа, засаж болно). Багш thread хэлбэрээр хязгааргүй хариулна. Админ зохисгүй сэтгэгдлийг нууна. Курсийн дундаж үнэлгээ каталогт харагдана.

**Blocked by:** 09

**Status:** done

- [x] 30%-ийн нөхцөл шалгалт
- [x] Курс бүрт нэг үнэлгээ, засах боломжтой
- [x] Thread хариулт (багш, тухайн хэрэглэгч)
- [x] Админ нуух + audit
- [x] Дундаж үнэлгээ, тоо каталог/шүүлтүүрт
- [x] Integration тест: нөхцөл, давхар үнэлгээ

Хэрэгжилт: `apps/api/src/reviews/`, migration `20261117870000_reviews`, `packages/shared/src/reviews.ts`, тохиргоо `reviewMinOwnedPercent` (default 30), `catalog/ratings.ts` нь жинхэнэ aggregate (нуугдаагүй review, 1 оронтой). Web: курсийн хуудасны `reviews-ui.tsx`, `/admin/reviews`. Тест: `apps/api/test/reviews.spec.ts`.

## Үлдсэн

- [x] Ticket 07-ийн "ratings.ts-ийг review aggregate-аар солих; курсийн хуудсанд review жагсаалт" биелсэн.
- [ ] `public` (dev) schema-д migration-ийг `pnpm db:deploy`-оор хэрэгжүүлэх (merge-ийн дараа).
