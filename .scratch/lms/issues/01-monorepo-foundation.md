# 01: Monorepo суурь ба тестийн орчин

**What to build:** pnpm + Turborepo monorepo: web апп (Next.js), API апп (NestJS), DB package (Prisma), shared package. Web хуудас API-ийн health endpoint-ыг дуудаж, API Postgres-тэй холбогдсоноо харуулна. API түвшний integration тестийн орчин (бодит Postgres, гадны adapter-уудын fake) бэлэн болно. i18n бүтэц (монгол хэл) суулгана.

**Blocked by:** None (can start immediately)

**Status:** in-progress — Supabase холболт хүлээж байна

> Өөрчлөлт: Docker байхгүй тул local Supabase-ийн оронд cloud Supabase `lms-dev` төсөл ашиглана. Тест `lms_test` schema-д ажиллана. CI нь Postgres service container ашиглана.

- [ ] `pnpm dev` нэг командаар web, api хоёулаа Supabase dev DB-тэй асна (код бэлэн, `.env` бөглөсний дараа шалгана)
- [ ] Web нүүр хуудас API health-ийг дуудаж "DB: ok" харуулна (код бэлэн, шалгах)
- [ ] API integration тест бодит Postgres-тэй ажиллаж, тест бүр цэвэр DB төлөвтэй эхэлнэ (код бэлэн, `DATABASE_URL_TEST`-ээр ажиллуулж шалгах)
- [x] Гадны сервисийн adapter interface загвар (fake-тэй) бий
- [ ] Prisma migration ажиллана (`init` migration үүссэн, DB-д deploy хийж шалгах)
- [x] CI (GitHub Actions): lint, typecheck, test
- [x] Бүх UI текст translation файлаас уншигдана
- [x] Brand нэр (`lms`) нэг тохиргооноос уншигдана
- [x] `.env.example` файлд бүх шаардлагатай хувьсагч жагсаагдсан; нууц түлхүүр git-д ороогүй
