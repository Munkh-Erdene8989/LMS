# LMS

Монгол зах зээлд зориулсан онлайн сургалтын платформ. Шийдвэрүүд: [docs/SPEC.md](docs/SPEC.md). Ажлын жагсаалт: [.scratch/lms/issues/](.scratch/lms/issues/).

## Бүтэц

| Хавтас | Юу вэ | Deploy |
|---|---|---|
| `apps/web` | Next.js — learner, teacher, admin UI | Vercel |
| `apps/api` | NestJS API | Railway |
| `packages/db` | Prisma schema + migration | — |
| `packages/shared` | Хуваалцсан төрөл, брэнд тохиргоо | — |

## Эхлүүлэх

Шаардлага: Node.js 20+, pnpm 10.

```bash
pnpm install
cp .env.example .env      # Supabase lms-dev төслийн connection string-ийг бөглөнө
pnpm db:deploy            # migration-уудыг dev DB-д хэрэгжүүлнэ
pnpm dev                  # web: http://localhost:3000, api: http://localhost:4000
```

Нүүр хуудсанд "API: ok, Өгөгдлийн сан: ok" харагдвал бүх давхарга холбогдсон гэсэн үг.

## Командууд

| Команд | Үйлдэл |
|---|---|
| `pnpm dev` | web + api watch горимоор |
| `pnpm test` | API integration тест (`DATABASE_URL_TEST`-ийн schema-д) |
| `pnpm typecheck` / `pnpm lint` | Төрөл шалгах |
| `pnpm db:migrate` | Schema өөрчилсний дараа шинэ migration үүсгэх |
| `pnpm db:deploy` | Migration-уудыг хэрэгжүүлэх |

## Тест

- Тест хийх цорын ганц seam: **API-ийн HTTP түвшин**. Бодит Postgres, гадны сервисүүд (SMS, имэйл, QPay, Mux) fake.
- Тест `DATABASE_URL_TEST`-д заасан schema-д (`lms_test`) ажиллаж, тест бүрийн өмнө тэр schema-ийн хүснэгтүүдийг цэвэрлэнэ. `public` schema-г заавал хориглосон.
- Шинэ тест: `apps/api/test/*.spec.ts`, `createTestApp()`-аар апп үүсгэнэ.

## Нууц түлхүүр

`.env` git-д орохгүй. Production-д Vercel/Railway-ийн environment variables-д тохируулна. Шаардлагатай хувьсагчдыг `.env.example`-ээс харна уу.
