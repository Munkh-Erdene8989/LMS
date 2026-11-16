# 10: Видео lesson (Mux)

**What to build:** Багш видео lesson-д файлаа шууд Mux руу upload хийж, боловсруулалтын төлөвийг харна. Эрхтэй хэрэглэгч богино хугацаатай signed URL-ээр видео үзэж, дээр нь өөрийн утас/имэйлийн хэсэгчилсэн хөдөлгөөнт watermark харагдана. Нэг аккаунт зэрэг 2-оос олон төхөөрөмжөөр тоглуулж чадахгүй.

**Blocked by:** 09

**Status:** ready-for-agent

- [ ] Mux direct upload + webhook (BullMQ-ээр боловсруулна)
- [ ] Signed playback token, богино хугацаатай, entitlement шалгалттай
- [ ] Хөдөлгөөнт watermark (жишээ: 9911****)
- [ ] Зэрэг тоглуулалт ≤ 2 (Redis heartbeat)
- [ ] Үзэлтийн явц (progress) API руу илгээгдэнэ
- [ ] Mux Data metadata (viewer, lesson id) тохируулагдсан
- [ ] Integration тест: эрхгүй хэрэглэгч token авахгүй, 3 дахь төхөөрөмж татгалзана
