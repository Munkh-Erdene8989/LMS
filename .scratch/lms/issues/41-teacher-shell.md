# 41: Багшийн самбар (teacher shell + хуудсууд)

**What to build:** DESIGN.md §5 `/teacher/*`. Sidebar-тай dashboard, тайван, хөдөлгөөн зөвхөн үйлдэлд.

**Blocked by:** 32, 33, 33b

**Status:** done (feat/41-teacher-shell)

## Хийх
- [x] `app/teacher/layout.tsx` (шинэ): 220px зүүн nav (`aria-current`, одоогийн хуудас `--accent-soft`), mobile-д дээд scroll chip nav; контент `--bg-alt` дэвсгэр дээр цагаан карт. `apply` хуудас shell-гүй байж болно.
- [x] `teacher/courses` (хүснэгт-жагсаалт + төлөвийн badge: ноорог/хянаж байна/нийтлэгдсэн), `teacher/courses/[id]` (section/lesson editor, `quiz-editor.tsx`, хадгалаагүй өөрчлөлтөд `beforeunload`, устгах → `useConfirm`).
- [x] `teacher/earnings` + `payouts.tsx` (stat карт, `formatMnt`, `window.confirm` → `useConfirm`), `teacher/analytics` (график `--chart-1/2`, keyboard/tooltip a11y, `analytics/page.tsx:221` орчим), `teacher/assignments`, `teacher/live`, `teacher/referral` (линк хуулах → toast), `teacher/community`, `teacher/apply` (form label/autocomplete).
- [x] Inline style → `app/teacher/teacher.module.css`.

## Шалгах
- typecheck, build.
