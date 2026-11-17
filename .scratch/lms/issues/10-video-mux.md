# 10: Видео lesson (Mux)

**What to build:** Багш видео lesson-д файлаа шууд Mux руу upload хийж, боловсруулалтын төлөвийг харна. Эрхтэй хэрэглэгч богино хугацаатай signed URL-ээр видео үзэж, дээр нь өөрийн утас/имэйлийн хэсэгчилсэн хөдөлгөөнт watermark харагдана. Нэг аккаунт зэрэг 2-оос олон төхөөрөмжөөр тоглуулж чадахгүй.

**Blocked by:** 09

**Status:** done

- [x] Mux direct upload + webhook (BullMQ-ээр боловсруулна)
- [x] Signed playback token, богино хугацаатай, entitlement шалгалттай
- [x] Хөдөлгөөнт watermark (жишээ: 9911****)
- [x] Зэрэг тоглуулалт ≤ 2 (Redis heartbeat)
- [x] Үзэлтийн явц (progress) API руу илгээгдэнэ
- [x] Mux Data metadata (viewer, lesson id) тохируулагдсан
- [x] Integration тест: эрхгүй хэрэглэгч token авахгүй, 3 дахь төхөөрөмж татгалзана

> Шийдвэр: Шинэ `media` модуль (`apps/api/src/media/`), Mux нь `MUX` adapter-ийн ард (`apps/api/src/adapters/mux.ts`: бодит HTTP, `DisabledMuxAdapter` — dev-д түлхүүргүй бол 503 `VIDEO_UNAVAILABLE`, тестэд `FakeMux`). Видео бүр `lesson_videos` мөр (id = Mux `passthrough`, солих бүрт шинэ мөр, хуучин asset-ийг `mux.delete-asset` ажлаар устгана); идэвхтэй видеоны id/төлөв/хугацааг `lessons.content`-д давхар (зөвхөн `VideoService` бичнэ). Migration `20261117830000_video`.
>
> Шийдвэр: Webhook `POST /webhooks/mux` — raw body-гоор `mux-signature` (HMAC, 5 мин tolerance) шалгаад `mux_webhook_events`-д (Mux event id-аар давхардалгүй) хадгалж `mux.webhook` (BullMQ) ажилд өгнө. Төлөв зөвхөн урагшилна (READY-аас буцахгүй); дараалал холилдсон ч passthrough → asset id → upload id-аар мөрөө олно. Webhook ирэхгүй (local dev) үед багшийн UI `POST /teacher/lessons/:id/video-sync`-ээр (Mux API) 10 сек тутам шалгана.
>
> Шийдвэр: Нийтлэгдсэн (APPROVED) видеог солихгүй (агуулга түгжигдэнэ); үл хамаарах нь бичлэг болгосон live (`content.fromLive`) — бичлэг READY болтол оруулж/сольж болно (`videoUploadAllowed`, `@lms/shared`).
>
> Шийдвэр: Тоглуулах — `POST /media/lessons/:id/playback { deviceId }`: `LessonAccessPolicy` (багш/админ шалгагдаагүйг ч үзнэ) → 15 минутын RS256 signed token (playback/thumbnail/storyboard), watermark (утас `9911****`, эсвэл имэйл `bo***@…`), Mux Data metadata (`video_id` = lesson id, `viewer_user_id`). Зэрэг ≤ 2 төхөөрөмж: хэрэглэгч бүрт Redis sorted set (Lua-гаар атомар), heartbeat 30 сек, TTL 90 сек, pause/хуудас хаахад `/media/playback/stop` (sendBeacon). Зочин (free preview) хязгааргүй, watermark-гүй. Player (`apps/web/app/video-player.tsx`, `@mux/mux-player-react/lazy`) үзсэн хувийг `POST /learning/lessons/:id/progress` руу 15 сек тутам/pause/дуусахад илгээнэ; watermark бүтэн дэлгэцэнд ч харагдана (`fullscreenElement`).

## Үлдсэн

- [ ] DRAFT хичээлийг бүрмөсөн устгахад `lesson_videos` cascade-аар устдаг ч Mux дээрх asset үлдэнэ — catalog → media хамаарал үүсгэхгүйгээр (event / cron) цэвэрлэх.
- [ ] Production Mux тохиргоо: Signing key, webhook URL (`<API>/webhooks/mux`), `MUX_*` env; бодит upload → webhook → тоглуулалтыг гараар шалгах.
- [ ] `public` (dev) schema-д migration-ийг `pnpm db:deploy`-оор хэрэгжүүлэх.
