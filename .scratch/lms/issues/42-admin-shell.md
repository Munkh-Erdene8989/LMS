# 42: Админ самбар (admin shell + хуудсууд)

**What to build:** DESIGN.md §5 `/admin/*`. Teacher shell-тэй ижил загвар, илүү нягт.

**Blocked by:** 32, 33 (41-ийн shell CSS-ийг дахин ашиглаж болно — зэрэгцээ бол өөрийн module)

**Status:** done (feat/42-admin-shell)

## Хийх
- [x] `app/admin/layout.tsx`: sidebar shell (бүлэглэсэн nav: Хэрэглэгч, Контент, Мөнгө, Систем), mobile chip nav. `app/admin/page.tsx` дээр 36-аас шилжсэн системийн төлөв (API/DB).
- [x] Хүснэгтүүд (users, payments, payouts, courses, reports, audit, reviews, course-reviews, teacher-applications …): мөр 44px, 14px текст, `<th scope>`, sticky thead, `overflow-x:auto` wrapper, hover мөр `--bg-alt`, дүн баруун + `tabular-nums` + `formatMnt`.
- [x] Бүх `window.confirm` (categories, community, credit-packages, legal, payments, payouts, reviews, subscription-plans, users/[id]) → `useConfirm({ danger })`; татгалзах шалтгаантай үйлдэл Dialog form.
- [x] Бүх `<button>`-д `type`; inline style → `app/admin/admin.module.css`.

## Шалгах
- typecheck, build. `grep -rn "window.confirm" apps/web/app/admin` = 0.
