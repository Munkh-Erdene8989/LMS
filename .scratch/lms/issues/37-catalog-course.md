# 37: Каталог ба курсийн хуудас

**What to build:** DESIGN.md §3 Course card, Lesson list, Modal; §5 `/courses`, `/courses/[id]`. Логик хэвээр (URL нь хайлтын төлөвийн эх үүсвэр), UI шинэ.

**Blocked by:** 32, 33, 33b

**Status:** done (feat/37-catalog-course)

## Хийх
- [x] `app/courses/page.tsx`, `catalog-ui.tsx`: том h1 + pill хайлт, sticky chip шүүлтүүр (ангилал, түвшин, эрэмбэ), grid 3/2/1, хоосон үр дүн `EmptyState` + «Шүүлтүүр цэвэрлэх», `loading.tsx` skeleton карт.
- [x] `app/course-ui.tsx`: `CourseCard` (16:10 cover эсвэл gradient fallback, гарчиг 2 мөр clamp, багш avatar+нэр, «12 хичээл · 4.8 ★», үнэ `formatPrice`, эзэмшсэн бол «Авсан» `--ok`), hover lift зөвхөн `(hover:hover)`. Lesson list мөр (icon тойрог: үнэгүй/авсан/түгжээтэй, хугацаа, үнэ).
- [x] `app/courses/[id]/page.tsx`: зүүн гарчиг/meta/тайлбар/lesson list, баруун sticky buybox (том үнэ, «Курс авах», ширхэгээр нийт, хямдрал, үлдэгдэл); mobile-д доод sticky бар. Багшийн блок (`/teachers/[id]`, community). `reviews-ui.tsx` шинэ хэв маяг.
- [x] `app/courses/purchase-ui.tsx`: `Dialog`-оор (focus trap), дүнгийн хайрцаг, кредит хүрэхгүй бол «Кредит цэнэглэх»; амжилтад toast «Авлаа: <нэр>» + CreditPill bump; `window.confirm` устгах. `₮`/`toFixed` → format helper.
- [x] `<img>` → `next/image` эсвэл `width/height`+`aspect-ratio`.
- [x] CSS: `app/courses/courses.module.css`.

## Шалгах
- typecheck, build. Demo флагтай үед каталог 12 курс харуулна.
