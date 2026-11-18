/**
 * Түр demo өгөгдөл (ticket 33b) — ЗӨВХӨН ХАРУУЛАХ. Бүх хүн зохиомол. ID бүр `demo-` угтвартай.
 * Тоонууд бүтээгдэхүүний дүрэмтэй нийцнэ: 1 кредит = 1,000₮; курсийн бүтэн үнэ lesson-уудын нийлбэрээс хямдтай;
 * шимтгэл referral 10% / платформ 40%. Хожим бүхэлд нь устгана (ticket-ийн «Устгах заавар»).
 */
import type {
  CatalogCourseCard,
  CategoryNode,
  CommunityCommentView,
  CommunityMember,
  CommunityPerson,
  CommunityPostView,
  CourseReviewPage,
  CreditEntryView,
  CreditPackageView,
  LessonType,
  NotificationItem,
  PayoutView,
  PublicCourseDetail,
  PublicSection,
  PublicTeacherProfile,
  PublicTeacherRef,
  ReviewView,
  SalesTotals,
  SubscriptionPlanView,
  TeacherEarningEntryView,
} from '@lms/shared';

export const CREDIT_PRICE_MNT = 1000;
const DAY = 86_400_000;
const NOW = Date.now();
const ago = (days: number) => new Date(NOW - days * DAY).toISOString();

// ---------------------------------------------------------------------------
// Ангилал
// ---------------------------------------------------------------------------
const cat = (n: number, name: string, slug: string, children: CategoryNode[] = []): CategoryNode => ({
  id: `demo-cat-${n}`,
  name,
  slug,
  position: n,
  children,
});

export const DEMO_CATEGORIES: CategoryNode[] = [
  cat(1, 'Программчлал', 'programming', [cat(11, 'Вэб хөгжүүлэлт', 'web'), cat(12, 'Өгөгдөл', 'data')]),
  cat(2, 'Дизайн', 'design'),
  cat(3, 'Бизнес ба маркетинг', 'business'),
  cat(4, 'Гадаад хэл', 'languages'),
  cat(5, 'Санхүү', 'finance'),
  cat(6, 'Хувийн хөгжил', 'personal'),
];

type CategoryRef = NonNullable<CatalogCourseCard['category']>;
const catRefs = new Map<string, CategoryRef>();
for (const top of DEMO_CATEGORIES) {
  catRefs.set(top.slug, { id: top.id, name: top.name, slug: top.slug, parent: null });
  for (const c of top.children) {
    catRefs.set(c.slug, { id: c.id, name: c.name, slug: c.slug, parent: { id: top.id, name: top.name, slug: top.slug } });
  }
}

// ---------------------------------------------------------------------------
// Багш нар
// ---------------------------------------------------------------------------
interface TeacherSeed {
  ref: PublicTeacherRef;
  bio: string;
  expertise: string;
}

const T = (n: number, name: string, expertise: string, bio: string): TeacherSeed => ({
  ref: { id: `demo-teacher-${n}`, name, avatarUrl: null },
  expertise,
  bio,
});

export const DEMO_TEACHERS: TeacherSeed[] = [
  T(1, 'Ганбаатар Бат-Эрдэнэ', 'Программ хангамж, өгөгдлийн шинжилгээ', 'Улаанбаатар дахь технологийн компанид 9 жил програм хангамжийн инженерээр ажиллаж байна. Эхлэгчдэд төвөгтэй ойлголтыг энгийн жишээгээр тайлбарлах дуртай.'),
  T(2, 'Доржсүрэн Сарангэрэл', 'UI/UX болон брэндийн дизайн', 'Гэрийн болон гадаадын харилцагчдад зориулж 60 гаруй төсөл хийсэн бүтээгч дизайнер. Дизайн бол авьяас биш, дадал гэдэгт итгэдэг.'),
  T(3, 'Баярсайхан Тэмүүлэн', 'Маркетинг, жижиг бизнес, цаг төлөвлөлт', 'Гурван жижиг бизнесийг эхнээс нь босгосон, одоо бусдад зөвлөгөө өгдөг. Онолоос илүү бодит туршлага хуваалцана.'),
  T(4, 'Лхагвасүрэн Оюунчимэг', 'Англи, япон хэлний заавар', 'Япон, Английн их сургуульд суралцсан, 12 жилийн заах туршлагатай хэлмэрч багш. IELTS-ийн 300 гаруй сурагчийг бэлтгэсэн.'),
  T(5, 'Пүрэвдорж Ананд', 'Хувийн санхүү, хөрөнгө оруулалт', 'Банкны салбарт 8 жил ажилласан санхүүгийн зөвлөх. Мөнгөө зөв удирдах нь баялгийн эхлэл гэдгийг хүн бүрт ойлгуулахыг зорьдог.'),
];

const teacherById = new Map(DEMO_TEACHERS.map((t) => [t.ref.id, t]));

// ---------------------------------------------------------------------------
// Курс
// ---------------------------------------------------------------------------
interface CourseSeed {
  n: number;
  title: string;
  teacher: number;
  category: string;
  level: CatalogCourseCard['level'];
  description: string;
  /** [section гарчиг, lesson гарчгууд] */
  sections: [string, string[]][];
  publishedDaysAgo: number;
  /** Review-ийн үнэлгээнүүд (дундаж үүнээс гарна) */
  ratings: number[];
}

const COURSE_SEEDS: CourseSeed[] = [
  { n: 1, title: 'Python хэлний суурь: 0-ээс эхлэн', teacher: 1, category: 'programming', level: 'BEGINNER', publishedDaysAgo: 120, ratings: [5, 5, 4, 5, 5, 4, 5],
    description: 'Программчлалд огт анхлан орж буй хүнд зориулсан курс. Хувьсагч, нөхцөл, давталт, функцээс эхлээд жижиг бодит програм бичтэл алхам алхмаар явна.',
    sections: [['Эхлэх нь', ['Python гэж юу вэ, яаж суулгах вэ', 'Анхны програм', 'Хувьсагч ба өгөгдлийн төрөл']], ['Урсгал удирдах', ['Нөхцөл ба салаалалт', 'Давталт', 'Дасгал: тоо таах тоглоом']]] },
  { n: 2, title: 'Вэб хөгжүүлэлт: HTML, CSS, JavaScript', teacher: 1, category: 'web', level: 'BEGINNER', publishedDaysAgo: 95, ratings: [5, 4, 5, 5, 4, 4],
    description: 'Өөрийн анхны вэб хуудсыг хөтөч дээр шууд бүтээнэ. Хариу үйлдэлтэй (responsive) бүдүүвч, энгийн интерактив хэсгүүд хийж сурна.',
    sections: [['HTML ба бүтэц', ['Вэб хэрхэн ажилладаг вэ', 'HTML-ийн үндсэн tag-ууд', 'Форм ба оролт']], ['CSS ба загвар', ['Selector ба box model', 'Flexbox ба Grid', 'Гар утсанд зориулсан загвар']], ['JavaScript', ['DOM-той ажиллах', 'Үйл явдал (event)', 'Төгсөлтийн төсөл: хийх зүйлсийн жагсаалт']]] },
  { n: 3, title: 'Өгөгдлийн шинжилгээ Excel болон SQL-ээр', teacher: 1, category: 'data', level: 'INTERMEDIATE', publishedDaysAgo: 70, ratings: [5, 5, 4, 4, 5],
    description: 'Ажлын байран дахь бодит хүснэгт, тайлан дээр суурилан өгөгдлөөс дүгнэлт гаргах арга. Pivot, томьёоны дараа SQL-ийн үндсийг оруулна.',
    sections: [['Excel-ийн хүч', ['Pivot хүснэгт', 'XLOOKUP ба нөхцөлт томьёо', 'Графикаар өгүүлэх нь']], ['SQL-ийн үндэс', ['SELECT ба шүүлт', 'JOIN-ууд', 'Бодит тайлан бичих']]] },
  { n: 4, title: 'UI/UX дизайны үндэс Figma-аар', teacher: 2, category: 'design', level: 'BEGINNER', publishedDaysAgo: 150, ratings: [5, 5, 5, 4, 5, 5, 4, 5],
    description: 'Хэрэглэгчийн хэрэгцээнээс эхлээд бүрэн дэлгэцийн прототип хүртэл. Figma-д auto-layout, component, хувилбарыг өдөр тутмын ажлын урсгалаар нь заана.',
    sections: [['Дизайны сэтгэлгээ', ['Хэрэглэгчийн судалгаа', 'Хэрэглэгчийн аялал', 'Wireframe зурах']], ['Figma-д практик', ['Auto-layout', 'Component ба variant', 'Прототип холбох']]] },
  { n: 5, title: 'Брэнд танигдах байдал: лого ба өнгө', teacher: 2, category: 'design', level: 'INTERMEDIATE', publishedDaysAgo: 60, ratings: [4, 5, 5, 4],
    description: 'Жижиг бизнесийн брэндийг хэрхэн нэг хэв шинжтэй болгох вэ. Лого, өнгөний палитр, фонт, хэрэглээний гарын авлага хүртэл.',
    sections: [['Брэндийн суурь', ['Брэндийн үнэ цэнэ', 'Өнгөний сэтгэл зүй']], ['Хэрэгжүүлэлт', ['Лого зурах процесс', 'Брэндбүүк бэлтгэх', 'Сошиал медиад хэрэглэх']]] },
  { n: 6, title: 'Дижитал маркетингийн бүрэн курс', teacher: 3, category: 'business', level: 'INTERMEDIATE', publishedDaysAgo: 85, ratings: [5, 4, 4, 5, 3, 5],
    description: 'Facebook зар, имэйл, агуулгын стратеги, хэмжилт. Бага төсвөөр үр дүн гаргах бодит кейс, загварууд дагалдана.',
    sections: [['Стратеги', ['Зорилтот хэрэглэгч тодорхойлох', 'Агуулгын календарь']], ['Сувгууд', ['Facebook ба Instagram зар', 'Имэйл маркетинг', 'Үр дүнгийн хэмжилт']]] },
  { n: 7, title: 'Жижиг бизнес эхлүүлэх алхмууд', teacher: 3, category: 'business', level: 'BEGINNER', publishedDaysAgo: 45, ratings: [5, 5, 4, 5, 4],
    description: 'Санаанаас анхны борлуулалт хүртэлх зам. Бүртгэл, татвар, анхны хэрэглэгч олох, мөнгөн урсгалыг ойлгох гэсэн хамгийн чухал алхмууд.',
    sections: [['Санаа ба шалгалт', ['Санаагаа шалгах', 'Анхны 10 хэрэглэгч']], ['Хууль ба мөнгө', ['Бүртгэл ба татвар', 'Үнэ тогтоох', 'Мөнгөн урсгал']]] },
  { n: 8, title: 'IELTS 6.5 хүртэл: Speaking ба Writing', teacher: 4, category: 'languages', level: 'INTERMEDIATE', publishedDaysAgo: 110, ratings: [5, 5, 5, 4, 5, 5],
    description: 'Хамгийн их оноо алддаг хоёр хэсгийг системтэй бэлтгэнэ. Бодит шалгалтын асуултууд, загвар хариулт, өөрийн бичгийг засах чеклист.',
    sections: [['Speaking', ['Part 1: богино хариулт', 'Part 2: 2 минутын яриа', 'Part 3: нарийвчилсан хэлэлцүүлэг']], ['Writing', ['Task 1: график тайлбарлах', 'Task 2: эссэ бүтэц', 'Түгээмэл алдаанууд']]] },
  { n: 9, title: 'Япон хэл N5: Эхлэгчдэд', teacher: 4, category: 'languages', level: 'BEGINNER', publishedDaysAgo: 30, ratings: [5, 4, 5],
    description: 'Хирагана, катакана, эхний 300 үг, үндсэн өгүүлбэрийн бүтэц. N5 шалгалтад орох хүсэлтэй хүмүүст тохирсон хурдтай.',
    sections: [['Бичгийн систем', ['Хирагана', 'Катакана']], ['Анхны өгүүлбэрүүд', ['Өөрийгөө танилцуулах', 'Тоо, цаг, огноо', 'N5 түвшний дасгал']]] },
  { n: 10, title: 'Хувийн санхүүгийн менежмент', teacher: 5, category: 'finance', level: 'BEGINNER', publishedDaysAgo: 100, ratings: [5, 5, 4, 5, 5, 4, 5],
    description: 'Орлого, зарлага, хадгаламж, зээлийн талаар өдөр тутмын шийдвэрээ сайжруулах курс. Гар утсан дээрх хүснэгтээр нэг сарын төсөв гаргана.',
    sections: [['Төсөв', ['Мөнгөө хаана зарцуулдаг вэ', '50/30/20 дүрэм', 'Нэг сарын төсөв хийх']], ['Зээл ба хадгаламж', ['Зээлийн хүү яаж ажилладаг вэ', 'Яаралтай сан']]] },
  { n: 11, title: 'Хөрөнгө оруулалтын үндэс: хувьцаа, бонд', teacher: 5, category: 'finance', level: 'INTERMEDIATE', publishedDaysAgo: 40, ratings: [4, 4, 5, 5],
    description: 'Эрсдэл ба өгөөжийн харилцаа, төрөлжүүлэлт, урт хугацааны хөрөнгө оруулалт. Монголын зах зээлийн бодит жишээнүүдтэй.',
    sections: [['Үндсэн ойлголт', ['Эрсдэл ба өгөөж', 'Хувьцаа гэж юу вэ']], ['Багц бүрдүүлэх', ['Бонд ба хадгаламж', 'Төрөлжүүлэлт', 'Өөрийн төлөвлөгөө']]] },
  { n: 12, title: 'Цаг төлөвлөлт ба өөрийгөө удирдах ур чадвар', teacher: 3, category: 'personal', level: 'ALL', publishedDaysAgo: 20, ratings: [5, 5, 4],
    description: 'Хийх зүйлсийн жагсаалт биш, ач холбогдлоор нь эрэмбэлж ажиллах арга. Анхаарал сарниулагчийг багасгах, өдрийн хэмнэл тогтоох практикууд.',
    sections: [['Анхаарал', ['Юуг хийхгүй байхаа сонгох', 'Гүн ажлын цонх']], ['Өдөр тутам', ['Өглөөний хэв маяг', 'Долоо хоногийн хяналт', 'Хэвшил тогтоох']]] },
];

const lessonType = (sIdx: number, lIdx: number, title: string): LessonType => {
  if (/Дасгал|Төсөл|төсөл/.test(title)) return 'ASSIGNMENT';
  if (/Бодит тайлан|Түгээмэл|Хяналт|төлөвлөгөө/.test(title)) return 'TEXT';
  if (lIdx === 2 && sIdx % 2 === 1) return 'QUIZ';
  return 'VIDEO';
};

export interface DemoCourse {
  seed: CourseSeed;
  id: string;
  sections: PublicSection[];
  lessonsTotal: number;
  price: number;
  reviews: ReviewView[];
  card: CatalogCourseCard;
  detail: PublicCourseDetail;
}

const REVIEW_BODIES = [
  'Маш ойлгомжтой тайлбарласан. Эхлэгч хүнд яг тохирсон хурдтай байлаа.',
  'Дасгал ажлууд бодит байсан тул шууд ажилдаа хэрэглэж чадлаа. Баярлалаа!',
  'Эхний хичээлийг үнэгүй үзээд шууд бүгдийг нь авсан. Үнэ цэнэтэй.',
  'Багшийн жишээнүүд сонирхолтой. Зарим хэсэг арай хурдан санагдсан ч дахин үзэж болдог нь тус боллоо.',
  'Монгол хэлээр ингэж цэгцтэй заасан курс олдохгүй байсан. Бусдад санал болгож байна.',
  'Хичээл бүр богино тул ажлын завсараар үзэхэд тохиромжтой.',
  'Суралцахад хэрэгтэй материал, дасгал нь сайн бэлтгэгдсэн байна.',
  'Асуултад багш хурдан хариулдаг. Community-д нэгдээд улам их тус боллоо.',
];

const REVIEWERS = ['Билгүүн', 'Номин-Эрдэнэ', 'Энхжин', 'Түвшинбаяр', 'Мөнхцэцэг', 'Золбоо', 'Саруул', 'Дөлгөөн'];

/** `learning.ts`-ийн ENROLLED-тэй ижил. */
const ENROLLED_SEEDS = [1, 4];

function buildCourse(seed: CourseSeed): DemoCourse {
  const id = `demo-course-${seed.n}`;
  const teacher = DEMO_TEACHERS[seed.teacher - 1]!;
  const sections: PublicSection[] = seed.sections.map(([title, lessons], si) => ({
    id: `demo-section-${seed.n}-${si + 1}`,
    title,
    lessons: lessons.map((lt, li) => {
      const free = si === 0 && li === 0;
      return {
        id: `demo-lesson-${seed.n}-${si + 1}-${li + 1}`,
        title: lt,
        type: lessonType(si, li, lt),
        priceCredits: free ? 0 : 2 + ((seed.n + si + li) % 3),
        isFreePreview: free,
        live: null,
      };
    }),
  }));
  const lessons = sections.flatMap((s) => s.lessons);
  const lessonsTotal = lessons.reduce((n, l) => n + l.priceCredits, 0);
  // Курсийн бүтэн үнэ = lesson-уудын нийлбэрийн ~80% (хямдрал)
  const price = Math.max(1, Math.floor(lessonsTotal * 0.8));

  const reviews: ReviewView[] = seed.ratings.map((rating, i) => ({
    id: `demo-review-${seed.n}-${i + 1}`,
    courseId: id,
    rating,
    body: REVIEW_BODIES[(seed.n + i) % REVIEW_BODIES.length]!,
    author: { id: `demo-user-${i + 1}`, name: REVIEWERS[(seed.n + i) % REVIEWERS.length]!, avatarUrl: null },
    createdAt: ago(3 + i * 6 + seed.n),
    editedAt: null,
    hidden: false,
    hiddenReason: null,
    replies:
      i === 0
        ? [
            {
              id: `demo-reply-${seed.n}-1`,
              author: { id: teacher.ref.id, name: teacher.ref.name, avatarUrl: null },
              byTeacher: true,
              body: 'Сэтгэгдэл бичсэнд баярлалаа! Дараагийн хичээлүүд дээр ч үргэлжлүүлэн хамт суралцъя.',
              createdAt: ago(2 + seed.n),
              hidden: false,
              hiddenReason: null,
            },
          ]
        : [],
  }));
  const average = Math.round((seed.ratings.reduce((a, b) => a + b, 0) / seed.ratings.length) * 10) / 10;

  const base = {
    id,
    title: seed.title,
    coverUrl: null,
    level: seed.level,
    priceCredits: price,
    lessonCount: lessons.length,
    hasFreePreview: true,
    category: catRefs.get(seed.category) ?? null,
    rating: { average, count: seed.ratings.length },
    publishedAt: ago(seed.publishedDaysAgo),
  };
  const card: CatalogCourseCard = { ...base, excerpt: seed.description.slice(0, 200), teacher: teacher.ref };
  const detail: PublicCourseDetail = {
    ...base,
    description: seed.description,
    teacher: { ...teacher.ref, bio: teacher.bio },
    pricing: { listCredits: price, lessonsTotalCredits: lessonsTotal, alreadySpentCredits: 0, payableCredits: price },
    sections,
    // Эзэмшсэн demo курс (`learning.ts`-ийн ENROLLED)
    viewer: ENROLLED_SEEDS.includes(seed.n) ? { ownsCourse: true, ownedLessonIds: [], canViewAll: false, isTeacher: false } : null,
  };
  return { seed, id, sections, lessonsTotal, price, reviews, card, detail };
}

export const DEMO_COURSES: DemoCourse[] = COURSE_SEEDS.map(buildCourse);
export const DEMO_COURSE_CARDS: CatalogCourseCard[] = DEMO_COURSES.map((c) => c.card);

export function demoTeacherProfile(id: string): PublicTeacherProfile | undefined {
  const t = teacherById.get(id);
  if (!t) return undefined;
  return { ...t.ref, bio: t.bio, expertise: t.expertise, courses: DEMO_COURSE_CARDS.filter((c) => c.teacher.id === id) };
}

export function demoReviewPage(courseId: string): CourseReviewPage | undefined {
  const c = DEMO_COURSES.find((x) => x.id === courseId);
  if (!c) return undefined;
  return { rating: c.card.rating, requiredPercent: 30, items: c.reviews, nextCursor: null, viewer: null };
}

// ---------------------------------------------------------------------------
// Кредит багц, сарын багц, гүйлгээ
// ---------------------------------------------------------------------------
export const DEMO_CREDIT_PACKAGES: CreditPackageView[] = [
  { id: 'demo-pkg-1', name: 'Эхлэл', credits: 10, priceMnt: 10 * CREDIT_PRICE_MNT, active: true, isTest: false, position: 1 },
  { id: 'demo-pkg-2', name: 'Түгээмэл', credits: 30, priceMnt: 28_000, active: true, isTest: false, position: 2 },
  { id: 'demo-pkg-3', name: 'Хэмнэлттэй', credits: 100, priceMnt: 90_000, active: true, isTest: false, position: 3 },
];

export const DEMO_SUBSCRIPTION_PLANS: SubscriptionPlanView[] = [
  { id: 'demo-plan-1', name: 'Сарын суурь', priceMnt: 19_000, credits: 20, active: true, position: 1 },
  { id: 'demo-plan-2', name: 'Сарын онцгой', priceMnt: 45_000, credits: 55, active: true, position: 2 },
];

export const DEMO_CREDIT_BALANCE = {
  balance: 37,
  lots: [
    { id: 'demo-lot-1', source: 'SUBSCRIPTION_GRANT' as const, initial: 20, remaining: 12, expiresAt: ago(-20), createdAt: ago(10) },
    { id: 'demo-lot-2', source: 'TOPUP' as const, initial: 30, remaining: 25, expiresAt: ago(-75), createdAt: ago(15) },
  ],
};

const entry = (n: number, type: CreditEntryView['type'], amount: number, reason: string, days: number, refType: string | null = null): CreditEntryView => ({
  id: `demo-entry-${n}`, type, amount, reason, refType, refId: null, paymentId: null, isTest: false, createdAt: ago(days),
});

export const DEMO_CREDIT_HISTORY: CreditEntryView[] = [
  entry(1, 'SPEND', -3, 'Хичээл: Pivot хүснэгт', 1, 'LESSON'),
  entry(2, 'SPEND', -3, 'Хичээл: Flexbox ба Grid', 2, 'LESSON'),
  entry(3, 'SUBSCRIPTION_GRANT', 20, 'Сарын багц: Сарын суурь', 10),
  entry(4, 'SPEND', -8, 'Курс: Python хэлний суурь: 0-ээс эхлэн', 12, 'COURSE'),
  entry(5, 'TOPUP', 30, 'Цэнэглэлт: Түгээмэл багц', 15),
  entry(6, 'SPEND', -2, 'Хичээл: Wireframe зурах', 17, 'LESSON'),
  entry(7, 'EXPIRE', -4, 'Хугацаа дууссан кредит', 40),
  entry(8, 'TOPUP', 10, 'Цэнэглэлт: Эхлэл багц', 55),
];

// ---------------------------------------------------------------------------
// Мэдэгдэл
// ---------------------------------------------------------------------------
const notif = (n: number, type: string, title: string, body: string, link: string | null, days: number, unread: boolean): NotificationItem => ({
  id: `demo-notif-${n}`, type, title, body, link, readAt: unread ? null : ago(days - 0.1), createdAt: ago(days),
});

export const DEMO_NOTIFICATIONS: NotificationItem[] = [
  notif(1, 'COMMUNITY_COMMENT', 'Шинэ сэтгэгдэл', 'Билгүүн таны нийтлэлд сэтгэгдэл үлдээлээ.', '/communities/demo-teacher-1', 0.1, true),
  notif(2, 'TEACHER_SALES', 'Шинэ борлуулалт', '«Python хэлний суурь: 0-ээс эхлэн» курс худалдан авагдлаа.', '/teacher/earnings', 0.5, true),
  notif(3, 'COURSE_APPROVED', 'Курс батлагдлаа', 'Таны «Цаг төлөвлөлт ба өөрийгөө удирдах ур чадвар» курс нийтлэгдлээ.', '/teacher/courses', 2, true),
  notif(4, 'SUBSCRIPTION_RENEWED', 'Сарын багц сунгагдлаа', '20 кредит таны данс руу нэмэгдлээ.', '/credits', 10, false),
  notif(5, 'LIVE_REMINDER', 'Live хичээл маргааш', 'IELTS Speaking-ийн live хичээл маргааш 20:00 цагт эхэлнэ.', '/me', 1.5, false),
  notif(6, 'REVIEW_REPLY', 'Багш хариу бичлээ', 'Ганбаатар Бат-Эрдэнэ таны сэтгэгдэлд хариулсан.', '/courses/demo-course-1', 6, false),
];

// ---------------------------------------------------------------------------
// Community
// ---------------------------------------------------------------------------
type Author = CommunityPerson & { isTeacher: boolean };
const student = (n: number, name: string): Author => ({ id: `demo-user-${n}`, name, avatarUrl: null, isTeacher: false });
const teacherAuthor = (n: number): Author => ({ id: `demo-teacher-${n}`, name: DEMO_TEACHERS[n - 1]!.ref.name, avatarUrl: null, isTeacher: true });

const post = (n: number, author: Author, body: string, days: number, likes: number, comments: number, pinned = false): CommunityPostView => ({
  id: `demo-post-${n}`,
  author,
  body,
  imageUrl: null,
  pinned,
  likeCount: likes,
  likedByMe: false,
  commentCount: comments,
  canDelete: false,
  canEdit: false,
  createdAt: ago(days),
  editedAt: null,
  hidden: false,
  hiddenReason: null,
});

export const DEMO_POSTS: Record<string, CommunityPostView[]> = {
  'demo-teacher-1': [
    post(1, teacherAuthor(1), 'Шинэ долоо хоногийн даалгавар: өөрийн хийсэн жижиг програмынхаа кодыг хуваалцаарай. Алдаа гарсан ч зүгээр, хамтдаа засья.', 1, 14, 3, true),
    post(2, student(1, 'Билгүүн'), 'for давталт дотор нөхцөл бичихэд indentation алдаа гараад байна. Хэн нэгэн тайлбарлаж өгөхгүй юу?', 2, 4, 3),
    post(3, teacherAuthor(1), 'Эхлэгчдэд санал болгох 3 ном: тэдгээрийн нэг нь бүр үнэгүй. Жагсаалтыг доор сэтгэгдэлд үлдээлээ.', 6, 22, 5),
  ],
  'demo-teacher-4': [
    post(4, teacherAuthor(4), 'Ирэх пүрэв гарагт IELTS Speaking-ийн live хичээл болно. Асуултаа урьдчилан бичээрэй.', 1, 18, 4, true),
    post(5, student(2, 'Номин-Эрдэнэ'), 'Part 2 дээр 2 минут бүтэн ярьж чадахгүй байна. Яаж бэлдэх вэ?', 3, 6, 3),
  ],
};

export const DEMO_COMMENTS: CommunityCommentView[] = [
  { id: 'demo-comment-1', author: teacherAuthor(1), body: 'Python-д догол мөр (indent) нь бүтцийг заадаг. Давталтын дотор 4 зай ашиглаад дахин оролдоод үз.', canDelete: false, canEdit: false, createdAt: ago(1.8), editedAt: null, hidden: false, hiddenReason: null },
  { id: 'demo-comment-2', author: student(3, 'Энхжин'), body: 'Надад ч адилхан байсан. Редакторын tab-аа зайгаар солиход болсон.', canDelete: false, canEdit: false, createdAt: ago(1.5), editedAt: null, hidden: false, hiddenReason: null },
  { id: 'demo-comment-3', author: student(1, 'Билгүүн'), body: 'Баярлалаа, асуудал шийдэгдлээ!', canDelete: false, canEdit: false, createdAt: ago(1.2), editedAt: null, hidden: false, hiddenReason: null },
];

const MEMBER_SEEDS: [string, number][] = [
  ['Билгүүн', 90], ['Номин-Эрдэнэ', 75], ['Энхжин', 60], ['Түвшинбаяр', 44], ['Мөнхцэцэг', 31], ['Золбоо', 18], ['Саруул', 9], ['Дөлгөөн', 3],
];
export const DEMO_MEMBERS: CommunityMember[] = MEMBER_SEEDS.map(([name, days], i) => ({
  id: `demo-user-${i + 1}`, name, avatarUrl: null, since: ago(days), removed: null,
}));

// ---------------------------------------------------------------------------
// Багшийн орлого, payout, analytics (demo-teacher-1-ийн өнцгөөс)
// ---------------------------------------------------------------------------
function earning(n: number, credits: number, commission: 10 | 40, days: number, courseTitle: string, lessonTitle: string | null): TeacherEarningEntryView {
  const gross = credits * CREDIT_PRICE_MNT;
  return {
    id: `demo-earning-${n}`,
    type: 'SALE_EARNING',
    amountMnt: Math.round((gross * (100 - commission)) / 100),
    credits,
    creditPriceMnt: CREDIT_PRICE_MNT,
    commissionPercent: commission,
    grossMnt: gross,
    attribution: commission === 10 ? 'REFERRAL' : 'PLATFORM',
    sale: { kind: lessonTitle ? 'LESSON' : 'COURSE', courseTitle, lessonTitle },
    reason: null,
    isTest: false,
    createdAt: ago(days),
  };
}

const C1 = 'Python хэлний суурь: 0-ээс эхлэн';
const C2 = 'Вэб хөгжүүлэлт: HTML, CSS, JavaScript';
const C3 = 'Өгөгдлийн шинжилгээ Excel болон SQL-ээр';

const SALE_ENTRIES: TeacherEarningEntryView[] = [
  earning(1, 8, 40, 0.5, C1, null),
  earning(2, 3, 40, 1, C3, 'Pivot хүснэгт'),
  earning(3, 12, 10, 2, C2, null),
  earning(4, 4, 40, 3, C2, 'Flexbox ба Grid'),
  earning(5, 8, 40, 5, C1, null),
  earning(6, 3, 10, 7, C1, 'Нөхцөл ба салаалалт'),
  earning(7, 10, 40, 9, C3, null),
  earning(8, 12, 40, 12, C2, null),
  earning(9, 8, 10, 15, C1, null),
];
const PAYOUT_ENTRY: TeacherEarningEntryView = {
  id: 'demo-earning-10', type: 'PAYOUT', amountMnt: -40_000, credits: null, creditPriceMnt: null, commissionPercent: null,
  grossMnt: null, attribution: null, sale: null, reason: 'Payout', isTest: false, createdAt: ago(20),
};
const totalEarned = SALE_ENTRIES.reduce((n, e) => n + e.amountMnt, 0);
export const DEMO_EARNINGS = {
  balanceMnt: totalEarned + PAYOUT_ENTRY.amountMnt,
  totalEarnedMnt: totalEarned,
  testBalanceMnt: 0,
  items: [...SALE_ENTRIES, PAYOUT_ENTRY],
  nextCursor: null as string | null,
};

const demoPayout: PayoutView = {
  id: 'demo-payout-1', status: 'PAID', amountMnt: 40_000, bank: 'KHAN', accountNumber: '5012****34',
  holderName: 'Ганбаатар Бат-Эрдэнэ', requestedAt: ago(22), processedAt: ago(20), transferRef: 'DEMO-REF-001', rejectReason: null,
};
export const DEMO_PAYOUTS = {
  balanceMnt: DEMO_EARNINGS.balanceMnt,
  lockedMnt: 0,
  availableMnt: DEMO_EARNINGS.balanceMnt,
  minimumMnt: 20_000,
  onHold: false,
  hasBankAccount: true,
  blockReason: null,
  openPayout: null,
  items: [demoPayout],
  nextCursor: null as string | null,
};

export const ZERO_TOTALS: SalesTotals = { sales: 0, credits: 0, grossMnt: 0, earningMnt: 0 };
export const addTotals = (a: SalesTotals, b: SalesTotals): SalesTotals => ({
  sales: a.sales + b.sales,
  credits: a.credits + b.credits,
  grossMnt: a.grossMnt + b.grossMnt,
  earningMnt: a.earningMnt + b.earningMnt,
});

/** Тодорхойлогдсон (random биш) борлуулалтын цуваа: period бүрт тогтмол. */
export function demoSalesPoint(period: string): SalesTotals {
  let h = 0;
  for (const ch of period) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const sales = h % 4 === 0 ? 0 : 1 + (h % 4);
  const credits = sales * (3 + (h % 5));
  const gross = credits * CREDIT_PRICE_MNT;
  return { sales, credits, grossMnt: gross, earningMnt: Math.round(gross * 0.65) };
}

const teacher1Courses = DEMO_COURSES.filter((c) => c.seed.teacher === 1);

export const DEMO_TEACHER_COURSE_ROWS = teacher1Courses.map((c, i) => {
  const courseSales = 8 - i * 2;
  const lessonSales = 14 - i * 3;
  const credits = courseSales * c.price + lessonSales * 3;
  const learners = 20 + i * 11;
  const completed = Math.floor(learners * (0.35 + i * 0.1));
  return {
    courseId: c.id,
    title: c.seed.title,
    courseSales,
    lessonSales,
    credits,
    earningMnt: Math.round(credits * CREDIT_PRICE_MNT * 0.65),
    learners,
    completedLearners: completed,
    completionPercent: Math.floor((completed / learners) * 100),
  };
});

export const DEMO_TEACHER_LESSON_ROWS = teacher1Courses
  .flatMap((c) => c.sections.flatMap((s) => s.lessons.filter((l) => l.priceCredits > 0).slice(0, 2).map((l) => ({ c, l }))))
  .slice(0, 6)
  .map(({ c, l }, i) => {
    const sales = 9 - i;
    return {
      lessonId: l.id,
      courseId: c.id,
      title: l.title,
      archived: false,
      sales,
      credits: sales * l.priceCredits,
      earningMnt: Math.round(sales * l.priceCredits * CREDIT_PRICE_MNT * 0.65),
    };
  });
