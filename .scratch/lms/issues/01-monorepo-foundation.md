# 01: Monorepo суурь ба тестийн орчин

**What to build:** pnpm + Turborepo monorepo: web апп (Next.js), API апп (NestJS), DB package (Prisma), shared package. Web хуудас API-ийн health endpoint-ыг дуудаж, API Postgres-тэй холбогдсоноо харуулна. API түвшний integration тестийн орчин (бодит Postgres, гадны adapter-уудын fake) бэлэн болно. i18n бүтэц (монгол хэл) суулгана.

**Blocked by:** None (can start immediately)

**Status:** done

> Өөрчлөлт: Docker байхгүй тул local Supabase-ийн оронд cloud Supabase `lms-dev` төсөл ашиглана. Тест `lms_test` schema-д ажиллана. CI нь Postgres service container ашиглана.

- [x] `pnpm dev` нэг командаар web, api хоёулаа Supabase dev DB-тэй асна
- [x] Web нүүр хуудас API health-ийг дуудаж "DB: ok" харуулна
- [x] API integration тест бодит Postgres-тэй ажиллаж, тест бүр цэвэр DB төлөвтэй эхэлнэ
- [x] Гадны сервисийн adapter interface загвар (fake-тэй) бий
- [x] Prisma migration ажиллана (`init` migration Supabase `public` болон `lms_test` schema-д deploy хийгдсэн)
- [x] CI (GitHub Actions): lint, typecheck, test
- [x] Бүх UI текст translation файлаас уншигдана
- [x] Brand нэр (`lms`) нэг тохиргооноос уншигдана
- [x] `.env.example` файлд бүх шаардлагатай хувьсагч жагсаагдсан; нууц түлхүүр git-д ороогүй
