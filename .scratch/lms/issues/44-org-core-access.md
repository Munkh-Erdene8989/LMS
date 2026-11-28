# 44: Байгууллага — DB, private course, эрхийн дүрэм

**What to build:** Байгууллагын хаалттай сургалтын цөм. Organization, гишүүнчлэл, course grant, курсийн `visibility`, house teacher. Lesson нээх дүрэмд байгууллагын эрхийг нэмнэ. SPEC: "Байгууллагын хаалттай сургалт" (story 79–90).

**Blocked by:** —

**Status:** done

## Хийх
- [x] Migration: `organizations` (name, active, contract_ends_at, seat_limit), `organization_members` (org, user, created_at, removed_at; идэвхтэй мөр unique), `organization_course_grants` (org, course; unique), `courses.visibility` (`PUBLIC` анхдагч / `PRIVATE`).
- [x] House teacher: settings-д house teacher user id; seed/script-ээр TEACHER эрхтэй брэнд нэртэй аккаунт үүсгэх (idempotent). Private курсийн эзэн заавал house teacher (API шалгана).
- [x] Private курс: catalog, хайлт, багшийн профайл, landing, referral, review queue-д гарахгүй; submit хийхэд review-гүй шууд `PUBLISHED`; үнэ тавих, assignment lesson, review, community-д хамаарахгүй (API татгалзана).
- [x] Эрхийн дүрэм нэг газар: entitlement ∨ free preview ∨ (идэвхтэй байгууллагын идэвхтэй гишүүн ∧ grant). Байгууллага идэвхтэй = `active` ∧ `contract_ends_at > now()`. Mux token, PDF URL, live линк, quiz асуулт бүгд энэ дүрмээр.
- [x] Web lesson-open дүрэм (`apps/web` дахь нэг дүрэм) — API-ийн хариунаас уншина, шинэ дүрэм зохиохгүй.
- [x] Integration тест: гишүүн + grant → нээгдэнэ; grant-гүй → хаалттай; хасагдсан / идэвхгүй / хугацаа дууссан → хаалттай; дахин идэвхжихэд прогресс хэвээр; private курс catalog/search-д гарахгүй; private курсийг худалдаж авах оролдлого 4xx.

## Шалгах
- typecheck, build, `pnpm test` ногоон.
