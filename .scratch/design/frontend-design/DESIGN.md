# Дизайн систем: Суралц (Монгол онлайн сургалтын marketplace)

Статус: санал (proposal). `apps/web` руу орохын өмнөх лавлах баримт. Туршиж харах: `prototype.html`.

## 1. Чиглэл ба үндэслэл

**Бүтээгдэхүүн:** суралцагч кредитээр (QPay) хичээл/курс ширхэгээр авна, багш курс зарна, багш бүр өөрийн community-тэй. UI Монгол хэлээр.

**Чиглэл: "Тайван өөртөө итгэлтэй" (Apple-like minimal).** Том, нягт (tight) гарчиг, их хэмжээний хоосон зай, нэг accent өнгө, зөөлөн гүн (depth), хүний үйлдэлд хариулдаг spring micro-interaction.

Шийдвэрүүд ба шалтгаан:

- **Accent = "Хөх тэнгэр"** (`#0a62d6` / dark `#4da3ff`). Нэг л өнгө: холбоос, үндсэн товч, сонгогдсон төлөв, үнэ. Монголын хөх тэнгэрээс санаа авсан бөгөөд corporate итгэл төрүүлнэ. Бусад бүх зүйл саарал-цагаан (neutral). Gradient wash, олон өнгө хэрэглэхгүй. Course cover-ууд л (контент) өнгөтэй.
- **Нэг "memorable moment":** hero дээрх lesson-ийн жагсаалт scroll хийхэд томорч задрах (sticky device). Энэ нь бүтээгдэхүүний гол санааг (хичээлийг *ширхэгээр* авна, үнэ нь кредитээр) шууд харуулна. Бусад хэсэг нам гүм.
- **Хөдөлгөөн хэмнэлттэй:** хуудас ачаалахад hero гарчиг үгээр нь гарна (нэг удаа), scroll-ийн үед statement хэсгийн үгс нэг нэгээр хар болно. Бусад хэсэгт зөвхөн нэг удаагийн зөөлөн reveal. Карт бүр дээр fade-up/hover-ийн урсгал хийхгүй. Үйлдэлд хариулсан хөдөлгөөн (товч дарах, modal нээх, toast, кредит "bump") нь spring.
- **Typography:** Inter (Cyrillic дэмждэг) + system fallback (`-apple-system`, SF Pro, Segoe UI). Нэг гэр бүл, жин (400/500/600/700) болон letter-spacing-ээр шатлал үүсгэнэ. Том гарчигт `-0.04em`.
- **Бүтэц зайгаар:** eyebrow, ALL-CAPS label, дугаарлалт хэрэглэхгүй. Дугаарлалт зөвхөн жинхэнэ дараалалд (гурван алхам, хичээлийн дугаар) байна.
- **Хоёр горим:** гэрэл = цагаан/`#f5f5f7`, харанхуй = жинхэнэ `#000` / `#111113` / `#1c1c1e` (OLED, Apple-ийн адил). `prefers-color-scheme` + `data-theme` гараар сонгох.
- **Хүртээмж:** focus-visible 3px ring, контраст AA, `prefers-reduced-motion` бүх хөдөлгөөнийг унтраана, товчны хамгийн бага өндөр 44px (мобайл), `aria-live` toast.

## 2. Design tokens (globals.css руу шууд хуулна)

Одоогийн `--bg --fg --muted --ok --err --border --chart-*` нэрсийг хадгалсан (хуучин код эвдрэхгүй). `--chart-*` хэвээр үлдээнэ.

```css
:root {
  /* Color: light */
  --bg: #ffffff;
  --bg-alt: #f5f5f7;
  --surface: #ffffff;
  --fg: #1d1d1f;
  --fg-2: #515154;
  --muted: #6e6e73;
  --border: rgba(0, 0, 0, 0.1);
  --accent: #0a62d6;
  --accent-hover: #0852b5;
  --accent-fg: #ffffff;
  --accent-soft: rgba(10, 98, 214, 0.1);
  --ok: #167a3e;
  --err: #c4262e;
  --glass: rgba(255, 255, 255, 0.72);
  --chart-1: #2563eb;
  --chart-2: #ea580c;

  /* Shadow (soft depth, 3 түвшин) */
  --shadow-1: 0 1px 2px rgba(0,0,0,.05), 0 1px 1px rgba(0,0,0,.03);
  --shadow-2: 0 8px 24px rgba(0,0,0,.08), 0 2px 6px rgba(0,0,0,.04);
  --shadow-3: 0 24px 60px rgba(0,0,0,.14), 0 6px 16px rgba(0,0,0,.06);

  /* Type */
  --font: 'Inter', -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', Roboto, system-ui, sans-serif;
  --fs-display: clamp(2.5rem, 1.4rem + 5.6vw, 5.5rem);  /* hero, 700, ls -0.04em, lh 1.04 */
  --fs-h1: clamp(2rem, 1.3rem + 3.2vw, 3.5rem);         /* 700, ls -0.035em, lh 1.08 */
  --fs-h2: clamp(1.5rem, 1.1rem + 1.8vw, 2.25rem);      /* 600-700, ls -0.03em */
  --fs-h3: 1.25rem;                                     /* 600, ls -0.02em */
  --fs-lead: clamp(1.125rem, 1rem + .6vw, 1.5rem);      /* 400, --fg-2 */
  --fs-body: 1.0625rem;                                 /* 17px, lh 1.5 */
  --fs-small: .875rem;
  --fs-micro: .75rem;

  /* Spacing (4px grid) */
  --s-1: 4px; --s-2: 8px; --s-3: 12px; --s-4: 16px; --s-5: 24px;
  --s-6: 32px; --s-7: 48px; --s-8: 64px; --s-9: 96px; --s-10: 144px;

  /* Radius: хэмжээнд тохируулан ялгана, бүгдэд нэг биш */
  --r-sm: 8px;    /* input chip, tag */
  --r-md: 14px;   /* input, row, toast */
  --r-lg: 22px;   /* card, modal, buybox */
  --r-pill: 999px;/* button, pill, chip */

  /* Motion */
  --ease-out: cubic-bezier(.22, 1, .36, 1);
  --ease-inout: cubic-bezier(.65, 0, .35, 1);
  --spring: linear(0, .0095 1.5%, .0386 3.1%, .1428 6.3%, .3029 9.7%, .4733 13%, .6416 16.4%, .7886 19.8%, .9065 23.2%, .9964 26.9%, 1.0581 30.9%, 1.0907 34.6%, 1.0997 38.4%, 1.0875 42.3%, 1.0613 46.7%, 1.0285 51.7%, 1.0006 57.3%, .9857 62.6%, .9812 67.9%, .9866 74.4%, .9975 82.5%, 1.0017 91%, 1);
  --d-fast: 150ms;   /* hover өнгө */
  --d-base: 280ms;   /* товч, modal scrim, toast гарах */
  --d-slow: 600ms;   /* spring: card, modal, toast орох */
  --d-hero: 900ms;   /* нэг удаагийн reveal, hero */

  /* Layout */
  --header-h: 52px;
  --wrap: 1120px;
}

@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --bg: #000000; --bg-alt: #111113; --surface: #1c1c1e;
    --fg: #f5f5f7; --fg-2: #c7c7cc; --muted: #98989d;
    --border: rgba(255,255,255,.14);
    --accent: #4da3ff; --accent-hover: #75b8ff; --accent-fg: #00142e;
    --accent-soft: rgba(77,163,255,.16);
    --ok: #4cd37b; --err: #ff6b6b;
    --glass: rgba(28,28,30,.72);
    --shadow-1: 0 1px 2px rgba(0,0,0,.5);
    --shadow-2: 0 8px 24px rgba(0,0,0,.5);
    --shadow-3: 0 24px 60px rgba(0,0,0,.7);
    --chart-1: #3b82f6;
  }
}
:root[data-theme="dark"] { /* дээрхтэй ижил утгууд, гараар сонгоход */ }
```

Анхаарах: `--spring` нь CSS `linear()` easing (Chrome/Safari/Firefox 2024+). Хуучин browser-т хүчингүй утга болж `ease` рүү унана, энэ нь зөвшөөрөгдөхүйц. `prototype.html`-д dark блок бүтнээрээ бичигдсэн.

Өнгөний дүрэм: accent зөвхөн интерактив эсвэл үнэ. `--ok` зөвхөн "авсан/амжилттай", `--err` зөвхөн алдаа. Border нь `rgba` тул `--bg`/`--bg-alt` дээр аль алинд ажиллана.

## 3. Component spec

Бүх компонент `--r-*`, `--s-*`, `--d-*` токенийг хэрэглэнэ. Давхар `:hover` нь `@media (hover:hover)` дотор ороход зүгээр.

**Header.** Өндөр `--header-h`, sticky, `--glass` дэвсгэр + `backdrop-filter: saturate(180%) blur(20px)`. Scroll > 8px болмогц 1px border гарна (`.scrolled`). Зүүн: wordmark; төв/зүүн: 3 nav холбоос (мобайлд нуугдаж, цэс рүү шилжинэ); баруун: credit pill + "Нэвтрэх" (нэвтэрсэн бол avatar цэс).

**Button.** Pill, өндөр 44 (sm 34), padding 0 22px, жин 500. Хувилбар: `primary` (accent), `secondary` (accent-soft дэвсгэр, accent текст), `ghost` (текст, hover-д доогуур зураас), `danger` (err). Дарахад `scale(.96)` + spring буцаалт. Disabled: opacity .45. Loading: текстийг "Илгээж байна…" болгож disabled болгоно, spinner хэрэггүй.

**Card.** `--surface`, 1px `--border`, `--r-lg`, `--shadow-1`. Зөвхөн *дарагдах* карт (course card) hover-д `translateY(-4px)` + `--shadow-2` (spring). Дарагдахгүй карт (admin panel, stat) hover эффектгүй.

**Course card.** 16:10 cover (gradient эсвэл зураг, нэр том жинтэй дээр нь), доор: гарчиг (h3 18px, 2 мөр хүртэл), багш (22px avatar + нэр, muted), хөл: "12 хичээл · 4.8 ★" зүүн, үнэ (`кр`) баруун. Багшийн нэр дээр дарвал `/teachers/[id]` (карт дотор nested link байвал cover+гарчиг л overlay link болно). Эзэмшсэн курс: үнэ оронд "Авсан" (`--ok`).

**Lesson list.** Мөр бүр бүтэн өргөн товч-мөр: зүүн icon тойрог (32px: ▶ үнэгүй = accent-soft, ✓ авсан = ok, ○ түгжээтэй), гарчиг + хугацаа (muted), баруун үнэ/төлөв. Мөрийн хооронд 1px divider. Hover-д зүүн padding 4px -> 12px (зөөлөн шилжилт). Түгжээтэй мөрийг дарвал худалдан авах modal. Lesson page дээр одоогийн мөр `--accent-soft` дэвсгэртэй.

**Credit balance pill.** Өндөр 34, pill, `--bg-alt` + border, зүүн жижиг accent coin, tabular-nums тоо. Утга өөрчлөгдөхөд `bump` (scale 1 -> 1.12 -> 1, spring). Дарвал `/credits`. `aria-label="Кредитийн үлдэгдэл: N"`. Хүрэлцэхгүй үед тоо `--err` болохгүй (шалтгаангүй айлгахгүй), харин modal-д тайлбарлана.

**Form / OTP input.** Input: өндөр 48, `--bg-alt` дэвсгэр, 1.5px transparent border, `--r-md`; focus-д `--accent` border + `--surface`. Label дээр нь (14px, 500), алдаа доор нь `--err` өнгөөр, юу буруу, яаж засахыг хэл. OTP: 6 нүд 48x56, дугаар л авна, автоматаар дараагийн нүд рүү, Backspace буцаана, paste бүх 6-г бөглөнө, `autocomplete="one-time-code"`, `inputmode="numeric"`. Focus-д нүд `scale(1.05)`.

**Modal.** Scrim `rgba(0,0,0,.4)` + `blur(6px)`. Самбар `--r-lg`, `--shadow-3`, өргөн ≤ 440. Орохдоо `scale(.92) translateY(12px)` -> 1 (spring, `--d-slow`). Focus trap, Esc, scrim дээр дарвал хаах, хаахад өмнөх элемент рүү focus буцна. Бүтэц: гарчиг (асуулт), 1 өгүүлбэр, дүнгийн хайрцаг (үнэ / үлдэгдэл), үйлдэл: Болих (secondary) + үндсэн үйлдэл (primary, "Авах"). Кредит хүрэхгүй бол үндсэн товч "Кредит цэнэглэх" болно.

**Toast.** Доод төвд, өнгө урвуу (`--fg` дэвсгэр, `--bg` текст), `--r-md`, `role=status aria-live=polite`. Орох: доороос spring; 3.2 сек, гарах: 280ms fade. Үйлдлийн нэртэй тохирно: товч "Авах" -> toast "Авлаа: <нэр>". Алдаа нь юу болсон, яаж засахыг хэлнэ, уучлалт гуйхгүй. Нэгэн зэрэг ≤ 3.

## 4. Motion зарчим

1. **Нэг найруулсан агшин.** Hero (гарчиг үгээр орох + sticky lesson stack) нь л гол шоу. Бусад нь тайван.
2. **Хариу хөдөлгөөн > чимэглэл.** Хэрэглэгчийн үйлдэлд (дарах, нээх, баталгаажуулах) spring; автоматаар болдог зүйл зөвхөн анхаарал татахад (reveal нэг удаа, дахин давтахгүй).
3. **Transform + opacity л хөдөлгөнө** (layout/paint-д нөлөөлөхгүй). Scroll логик: нэг passive `scroll` + `requestAnimationFrame`, нэг CSS хувьсагч (`--p`). Хожим `animation-timeline: view()`-ээр сайжруулж болно (feature-detect).
4. **Хугацаа:** 150 (өнгө) / 280 (товч, scrim) / 600 (spring) / 900 (hero reveal). 1 секундээс дээш хөдөлгөөн хийхгүй.
5. **`prefers-reduced-motion`:** бүх animation/transition ~0, sticky stage -> static, scroll-reveal -> эхнээсээ харагдана (prototype-д бүгд хийгдсэн).
6. **Хүртээмж:** хөдөлгөөн нь мэдээлэл дангаараа дамжуулахгүй; focus ring хөдөлгөөнөөс хамаарахгүй.

## 5. Хуудас бүрийн төлөвлөгөө

Одоо байгаа route-ууд: `/`, `/courses`, `/courses/[id]`, `/courses/[id]/lessons/[lessonId]`, `/learning`, `/learning/[courseId]`, `/credits`, `/subscription`, `/me`, `/login`, `/verify`, `/notifications`, `/communities`, `/communities/[teacherId]`, `/teachers/[id]`, `/legal/[slug]`, `/r/[code]`, `/teacher/*` (apply, courses, courses/[id], assignments, earnings, analytics, live, referral, community), `/admin/*` (users, payments, payouts, courses, categories, credit-packages, subscription-plans, teacher-applications, course-reviews, reviews, reports, audit, legal, community).

**`/` (нүүр).** Hero: том гарчиг, 1 өгүүлбэр, 2 товч. Доор sticky lesson-stack (prototype шиг). Дараа нь statement хэсэг (scroll-ээр үг хар болно), эрэлттэй сургалтын 3 баганат grid (ангиллын chip-тэй), "Гурван алхам" (жинхэнэ дараалал), хөл. Одоо байгаа "системийн төлөв" (API/DB) блокийг нүүрнээс авч `/admin` рүү шилжүүлэх санал.

**`/courses`.** Дээр нь том h1 + хайлт (pill input), доор sticky chip шүүлтүүр (ангилал), grid 3/2/1 багана. Хоосон үр дүн: "Тохирох сургалт олдсонгүй. Шүүлтүүрээ цэвэрлээд үзнэ үү." + товч. Skeleton карт `--bg-alt` shimmer (reduced-motion-д статик).

**`/courses/[id]`.** Зүүн: гарчиг, meta, тайлбар, lesson list; баруун: sticky buybox (үнэ том, "Курс авах", ширхэгээр авбал нийт, үлдэгдэл). Мобайлд buybox контентийн дээр, мөн доод sticky "Курс авах" бар. Доор: багшийн блок (`/teachers/[id]`, community рүү холбоос), сэтгэгдэл.

**Lesson page.** Төвлөрсөн: том видео (16:9, `--r-lg`), доор гарчиг + "Дараагийн хичээл" товч, баруун (≥980px) lesson list sidebar (одоогийн мөр accent-soft), мобайлд жагсаалт доор accordion. Header хөнгөн (зөвхөн буцах + ахиц). Үзсэн тэмдэглэх нь toast "Дууссан гэж тэмдэглэлээ".

**`/learning`, `/learning/[courseId]`.** Эзэмшсэн курсын карт (ахицын нимгэн 4px progress bar, accent). "Үргэлжлүүлэх" primary товч нэг л. Курсийн дотор: lesson list + ахиц + гэрчилгээ (`/verify`) холбоос.

**`/credits`.** Дээр том үлдэгдэл (display размер, тоо нэмэгдэх count animation), доор багцуудын 3 карт (нэгийг нь "Түгээмэл" accent хүрээтэй), QPay modal (QR + төлөв), доор гүйлгээний түүх (хүснэгт-жагсаалт, tabular-nums). Төлбөр баталгаажихад toast + pill bump.

**`/teacher/*`.** Сайдбартай dashboard shell: зүүн 220px нарийн nav (одоогийн хуудас accent-soft), контент `--bg-alt` дэвсгэр дээр цагаан карт. `/teacher/courses`: хүснэгт-жагсаалт + төлөвийн badge (ноорог/хянаж байна/нийтлэгдсэн). `/teacher/earnings`, `/analytics`: stat-ууд (том тоо + жижиг label), график `--chart-1/2`. Хэт их эффект байхгүй, хөдөлгөөн зөвхөн үйлдэлд.

**`/admin/*`.** Teacher shell-тэй ижил, илүү нягт (dense): мөрийн өндөр 44, жижиг 14px текст. Хүснэгт: толгой sticky, hover мөр `--bg-alt`. Аюултай үйлдэл (татгалзах, блоклох) modal-оор баталгаажуулна, `danger` товч. Хөдөлгөөн хамгийн бага (зөвхөн modal/toast).

**Auth (`/login`, `/verify`).** Нарийн (440px) төвлөрсөн карт, OTP нүднүүд, дахин илгээх countdown (muted).

## 6. Нэвтрүүлэх дараалал (globals.css руу)

1. Дээрх `:root` токенуудыг хуучин блокийн оронд тавина (нэрс нийцтэй).
2. `body` фонт -> `var(--font)`; `next/font` ашиглан Inter (subsets: latin, cyrillic) ачаалж `--font`-д оноох (Google Fonts `<link>` биш).
3. Хуучин `.card`, `.input`, `.btn` классыг §3-ын спектээр сольж, `.page` max-width-ийг `--wrap` болгох.
4. Hero scroll logic-ийг жижиг client component (`useScrollProgress`) болгох. Бусад reveal нь `IntersectionObserver` hook.
5. `prefers-reduced-motion` блокийг глобал нэмэх (prototype-ийн төгсгөлөөс хуулна).
