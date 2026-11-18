# 40: Community, мэдэгдэл, профайл, бусад нийтийн хуудас

**What to build:** Үлдсэн нийтийн хуудсуудыг шинэ системд оруулна.

**Blocked by:** 32, 33, 33b

**Status:** todo

## Хийх
- [ ] `app/communities/page.tsx`, `communities/[teacherId]/page.tsx`: feed (post карт, avatar, `formatRelative`), бичих хэсэг (label, `beforeunload` хадгалаагүй үед), устгах/нуух → `useConfirm`; inline style → module.
- [ ] `app/teachers/[id]` (байгаа бол): багшийн профайл, курсын grid.
- [ ] `app/notifications/page.tsx`: жагсаалт, уншаагүй тэмдэг (өнгөөс гадна цэг/текст), `<button type>`.
- [ ] `app/me/page.tsx`: профайл form (label, autocomplete `name`), avatar, хоёр дахь identifier.
- [ ] `app/legal/[slug]/*`: уншихад тохиромжтой 68ch typography; `accept.tsx`.
- [ ] `app/r/[code]/page.tsx`, `app/error.tsx`, `app/global-error.tsx`: юу болсон + яаж засах + retry; `not-found.tsx` (байхгүй бол нэмэх).
- [ ] CSS: хавтас бүрт module.

## Шалгах
- typecheck, build.
