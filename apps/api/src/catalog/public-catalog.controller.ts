import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import {
  CATALOG_SORTS,
  COURSE_LEVELS,
  type CatalogPage,
  type CatalogQuery,
  type LessonAttachmentUrl,
  type MoneyRules,
  type PublicCourseDetail,
  type PublicLessonContent,
  type PublicTeacherProfile,
} from '@lms/shared';
import { z } from 'zod';
import { OptionalAuth, Viewer, type CurrentUserInfo } from '../auth/auth.guard';
import { SettingsService } from '../admin/settings.service';
import { ZodPipe } from '../zod-pipe';
import { PublicCatalogService } from './public-catalog.service';

const Uuid = new ParseUUIDPipe();

/** Буруу утгатай query параметрийг алдаа өгөхийн оронд үл тооно (URL-ийг хэрэглэгч гараар засаж болно). */
const lenient = <T extends z.ZodTypeAny>(schema: T) => schema.optional().catch(undefined);
const credits = lenient(z.coerce.number().int().min(0).max(1_000_000));

const CatalogQuerySchema = z.object({
  q: lenient(z.string().trim().max(100)),
  category: lenient(z.string().trim().min(1).max(100)),
  level: lenient(z.enum(COURSE_LEVELS as [string, ...string[]])),
  minPrice: credits,
  maxPrice: credits,
  minRating: lenient(z.coerce.number().min(1).max(5)),
  freePreview: lenient(z.enum(['1', 'true']).transform(() => true)),
  sort: lenient(z.enum(CATALOG_SORTS as [string, ...string[]])),
  page: lenient(z.coerce.number().int().min(1).max(10_000)),
  pageSize: lenient(z.coerce.number().int().min(1).max(48)),
});

/**
 * Нийтийн каталог — нэвтрэлт шаардахгүй (web SSR-ээс шууд дуудна).
 * Курс, lesson-ы endpoint optional auth-тай: нэвтэрсэн бол хувийн үнэ, эзэмшил, эрхтэй контент (ticket 09).
 */
@Controller('catalog')
export class PublicCatalogController {
  constructor(
    private readonly catalog: PublicCatalogService,
    private readonly settings: SettingsService,
  ) {}

  /** Кредитийн ₮ үнэ ба шимтгэл — landing тооцоолуур, шимтгэлийн тайлбар админы бодит тохиргоог харуулна. */
  @Get('money-rules')
  async moneyRules(): Promise<MoneyRules> {
    const [creditPriceMnt, commissionPlatformPercent, commissionReferralPercent] = await Promise.all([
      this.settings.get('creditPriceMnt'),
      this.settings.get('commissionPlatformPercent'),
      this.settings.get('commissionReferralPercent'),
    ]);
    return { creditPriceMnt, commissionPlatformPercent, commissionReferralPercent };
  }

  @Get('courses')
  list(@Query(new ZodPipe(CatalogQuerySchema)) q: z.infer<typeof CatalogQuerySchema>): Promise<CatalogPage> {
    return this.catalog.list(q as CatalogQuery);
  }

  @Get('courses/:id')
  @OptionalAuth()
  course(@Param('id', Uuid) id: string, @Viewer() viewer: CurrentUserInfo | null): Promise<PublicCourseDetail> {
    return this.catalog.course(id, viewer);
  }

  @Get('lessons/:id')
  @OptionalAuth()
  lesson(@Param('id', Uuid) id: string, @Viewer() viewer: CurrentUserInfo | null): Promise<PublicLessonContent> {
    return this.catalog.lesson(id, viewer);
  }

  /** Материал татах: эрх lesson-ы контенттой ижил; татах мөчид шинэ, богино хугацаатай signed URL. */
  @Get('lessons/:id/attachments/:attachmentId/url')
  @OptionalAuth()
  attachmentUrl(
    @Param('id', Uuid) id: string,
    @Param('attachmentId', Uuid) attachmentId: string,
    @Viewer() viewer: CurrentUserInfo | null,
  ): Promise<LessonAttachmentUrl> {
    return this.catalog.attachmentUrl(id, attachmentId, viewer);
  }

  @Get('teachers/:id')
  teacher(@Param('id', Uuid) id: string): Promise<PublicTeacherProfile> {
    return this.catalog.teacher(id);
  }
}
