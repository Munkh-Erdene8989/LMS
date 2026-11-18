# 38: Хичээл үзэх ба «Миний сургалт»

**What to build:** DESIGN.md §5 Lesson page, `/learning`. Логик хэвээр.

**Blocked by:** 32, 33, 33b

**Status:** todo

## Хийх
- [ ] `app/courses/[id]/lessons/[lessonId]/page.tsx`, `lesson-learning.tsx`: төвлөрсөн 16:9 видео (`--r-lg`), доор гарчиг + «Дараагийн хичээл», ≥980px баруун sidebar lesson list (одоогийн мөр `--accent-soft`), mobile-д доор accordion. Хөнгөн дээд мөр (буцах + ахиц).
- [ ] Үзсэн тэмдэглэх → toast «Дууссан гэж тэмдэглэлээ». Quiz, assignment (`assignment-ui.tsx`), text/PDF lesson-ий хэв маяг; түгжээтэй lesson → худалдан авах CTA.
- [ ] `app/video-player.tsx`: watermark transform-оор (32-т CSS хийгдсэн бол JS-ийг тааруулах).
- [ ] `app/learning/page.tsx`, `learning-ui.tsx`: эзэмшсэн курсын карт + 4px progress bar, нэг primary «Үргэлжлүүлэх»; хоосон бол `EmptyState` → каталог.
- [ ] `app/learning/[courseId]/page.tsx`, `certificate-card.tsx`: lesson list + ахиц + гэрчилгээ (`/verify`).
- [ ] CSS: `app/learning/learning.module.css`, lesson хавтсанд module.

## Шалгах
- typecheck, build.
