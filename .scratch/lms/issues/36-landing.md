# 36: Нүүр хуудас (landing)

**What to build:** `app/page.tsx`-ийг бүрэн шинэчилнэ. Эх: `.scratch/design/frontend-design/prototype.html` (hero, sticky lesson stack, statement) + `.scratch/design/taste-skill/index.html` (кредит тооцоолуур, багшид, community, үнэ, FAQ). Хоёр найруулсан moment: lesson stack, тооцоолуур.

**Blocked by:** 32, 33, 33b

**Status:** todo

## Хийх
- [ ] Хэсгүүд: Hero (гарчиг үгээр орох, 1 өгүүлбэр, 2 товч: «Курс үзэх», «Багш болох») → sticky lesson stack (`useScrollProgress`, `--p`) → кредит тооцоолуур → statement (scroll-оор үг тодрох) → онцлох курс 3/2/1 grid (`fetchCatalog`-оос, demo fallback) → «Багшид» (10% referral vs 40% платформ, жишээ тооцоо) → community preview → үнэ (credit package + subscription plan API, demo fallback) → FAQ (`<details>`) → CTA.
- [ ] Тооцоолуур (client component `app/landing/credit-calculator.tsx`): slider «авсан хичээл» → курсийн үлдэгдэл үнэ = `max(0, coursePrice − ownedLessonCredits)` (SPEC «Мөнгөний дүрэм»-ийг шалгаж томьёог баталгаажуулах), 1 кр = 1,000₮ (`formatMnt`). Range input label, keyboard.
- [ ] Системийн төлөвийн блок (`fetchHealth`) → `app/admin/page.tsx` руу шилжүүлэх.
- [ ] Copy `landing.*` namespace. Тоон баримт SPEC-ээс; жишээ утгууд demo-оос.
- [ ] Reduced-motion: stack статик, үгс бүгд харагдана. JS-гүй үед бүх контент харагдана.
- [ ] CSS: `app/landing/landing.module.css`; компонентууд `app/landing/*`.

## Шалгах
- typecheck, build. Lighthouse-д CLS ~0 (hero зураггүй, font swap).
