# Суралц landing prototype: тэмдэглэл

Файлууд: `index.html`, `landing.css`, `landing.js`, `favicon.svg`, `assets/` (design-taste-frontend kit-ийн хуулбар, засаагүй).
Нээх: `index.html`-ийг шууд браузерт (CDN-ээс зөвхөн Google Fonts Inter ачаална). Нэр "Суралц" нь ажлын нэр (хайлт хийгээгүй).

## Дизайны шийдвэр
- Төрөл: software (web app). Skill-ийн дилерийн palette/hero-г ашиглаагүй, хэрэглэгчийн "Apple-like минимал" хэв маягийг дагасан.
- Палитр: ground #fbfbfd, surface #f2f2f5, ink #1d1d1f, muted #626268, ганц accent #0071e3 (Apple цэнхэр). Violet байхгүй, эффект/gradient ground байхгүй (hero дээр нэг сул цэнхэр гэрэл).
- Фонт: Inter (Cyrillic + Ө, Ү дэмжинэ), display 600, tracking -0.03em/-0.04em. Hero h1 38-76px.
- Хэмнэл: kit-ийн "нэг section = нэг дэлгэц" (100vh), --padt 120, --padb 72, 12 баганат grid, pill товч, 24px gutter. 1440 дээр хуваалттай section-ууд баруун картаа дэлгэцийн өндөр хүртэл сунгана (`.split`, >=1280px).
- Зураггүй: фото stand-in татаагүй. Visual нь UI mock (кредит тооцоолуур, курсийн cover, комисс харьцуулалт, community feed) тул бодит бүтээгдэхүүний дүр төрх.
- Тооцоолуур (#credits): range slider "аль хэдийн авсан хичээл" -> курсийн үнэ = max(0, 45 - 5*авсан) (SPEC 180-р мөр). 1 кр = 1,000₮, 10%/40% шимтгэл, 50,000₮ босго, 30 хоног, 3 хоногийн grace бүгд SPEC-ээс. Нэгдсэн үнэ (20,000₮ / 35,000₮) болон курсүүдийн нэр/үнэ нь ЖИШЭЭ (`data-assumed`), SPEC-д байхгүй.

## Motion inventory
| Элемент | Хэрхэн | Хугацаа / easing |
|---|---|---|
| Hero h1, lead, товчнууд | kit-ийн `data-enter` (мөр мөрөөр гарч ирнэ, нэг удаа) | ~1.1s, cubic-bezier(.22,1,.36,1) |
| Scroll reveal: калькулятор, курсийн grid, комиссын карт, feed, үнийн grid | opacity 0->1 + translateY 16px, нэг удаа, IntersectionObserver | 700ms, .22,1,.36,1; carda-д 90/180ms delay биш (grid бүхэлдээ) |
| Комиссын мөр (fee track) | scaleX 0->1 харагдахад | 900ms, 250ms delay |
| Statement section (#why) | kit-ийн `word-highlight` moment: үг бүр scroll-д уялдан харлана | scroll-scrubbed, reduced: бүгд ink |
| Тооцоолуур | slider thumb hover scale 1.08/press .96 (150ms), bar scaleX (300ms), хичээлийн нүд өнгө (200ms) | --ease .2,.8,.2,1 |
| Товч/линк/карт | kit motion layer: товч 1px өргөгдөнө, карт 2px, underline зурагдана, нум 3px | 150/120/90ms |
| Reduced motion | reveal унтарч бүх контент харагдана, transition 0 | `prefers-reduced-motion` |
JS-гүй үед бүх контент харагдана (reveal нь `html.rv` класс нэмэгдсэний дараа л нуугдана).

## Skill-ийн checker / gate үр дүн
- copy-lint: 0 FAIL, 1 WARN (тооцоолуурын тоон мөр).
- gate.mjs: round 1 = FAIL 71, round 2 = FAIL 37, round 3 = **GATE: OPEN 24** (rounds used up). Дараа нь нэмэлт засвар хийгдсэн (gate-г дахин тооцоогүй), `consistency --quick` үлдсэн FAIL:
  - **scroll-reveal x5** - хэрэглэгч "smooth scroll reveals" гэж шаардсан тул ЗОРИУД зөрчсөн (skill зөвхөн dealt moment-д зөвшөөрдөг). Waiver файл үүсгээгүй. Хэрэв gate-ийг PASS болгох бол reveal-ийг арилгах эсвэл waivers.json-д 5 мөр нэмнэ.
  - **copy-headline, copy-headings** - checker англи үгэнд суурилсан (category noun), монгол h1/h3-д худал дохио гэж үзэв.
  - **no-visual (#community)**, **container-edges/off-grid (steps жагсаалт)**, **section-gaps (hero->credits, 390 дээр courses/pricing)**, **one-heading (courses)** - засаагүй үлдсэн.
- Хийж чадаагүй: perf.mjs, 1024/820/768 shoot, 320 дахин шалгалт; 390 дээр зарим section 1-2 дэлгэцээс өндөр (--hm тохируулга дутуу). Фонтын ачаалал сүлжээ шаарддаг тул шалгаагүй.

## apps/web руу порт хийх
- `assets/system.css` + `motion/motion.css` + `ui/cards.css` -> `apps/web/app/(marketing)/` дотор global marketing CSS (эсвэл CSS module), `system.js`/`motion.js` -> client component `<Motion />` (useEffect дотор динамик import). Kit-ийг "plain files" болгож `public/assets`-д тавьж `<link>`-ээр ачаалбал хамгийн энгийн.
- `:root` токенууд (index.html `<style>`) -> `app/globals.css`; Inter -> `next/font/google` (`subsets: ['cyrillic','cyrillic-ext','latin']`), `--font-text/--font-display` руу холбоно.
- `landing.css` -> `landing.css` (marketing route-д импорт).
- Компонент: `<Nav/>` (header.nav), `<Hero/>` (section.hero--calm), `<CreditCalculator/>` (#credits; `landing.js` дахь slider логик -> `useState`, `payCr = Math.max(0, 45 - 5*owned)`; жинхэнэ курсийн үнэ props-оор), `<CourseCard/>` (a.card.course, `next/link`), `<TeacherFee/>` (.fee), `<CommunityPreview/>` (.feed), `<Statement/>` (word-highlight; kit moments.js-г client-д mount), `<PricingPlans/>` (admin-ийн plan/package өгөгдлөөс), `<Faq/>` (.faq), `<Footer/>` (footer.closing).
- Reveal: `landing.js` дахь IntersectionObserver -> `useReveal()` hook эсвэл `<Reveal>` wrapper (`.rv`/`.is-in` CSS хэвээр). `<html class="js rv">`-г SSR-д биш client-д нэм (hydration-д анхаар).
- `m-enter` head скрипт -> `app/layout.tsx` дахь inline `<script>`; `data-motion`, `data-type` -> `<html>` атрибут.
- Үнэ/курс/кредит нь дараа нь API-аас (courses, credit packages, subscription plans) орно; одоогийн `data-assumed` утгуудыг орлуулна.
