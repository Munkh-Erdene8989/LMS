# 40: Community, мэдэгдэл, профайл, бусад нийтийн хуудас

**What to build:** Үлдсэн нийтийн хуудсуудыг шинэ системд оруулна.

**Blocked by:** 32, 33, 33b

**Status:** done (feat/40-community-misc)

## Хийх
- [x] `app/communities/page.tsx`, `communities/[teacherId]/page.tsx`: feed (post карт, avatar, `formatRelative`), бичих хэсэг (label, `beforeunload` хадгалаагүй үед), устгах/нуух → `useConfirm`; inline style → module.
- [x] `app/teachers/[id]` (байгаа бол): багшийн профайл, курсын grid.
- [x] `app/notifications/page.tsx`: жагсаалт, уншаагүй тэмдэг (өнгөөс гадна цэг/текст), `<button type>`.
- [x] `app/me/page.tsx`: профайл form (label, autocomplete `name`), avatar, хоёр дахь identifier.
- [x] `app/legal/[slug]/*`: уншихад тохиромжтой 68ch typography; `accept.tsx`.
- [x] `app/r/[code]/page.tsx`, `app/error.tsx`, `app/global-error.tsx`: юу болсон + яаж засах + retry; `not-found.tsx` (байхгүй бол нэмэх).
- [x] CSS: хавтас бүрт module.

## Шалгах
- typecheck, build.
