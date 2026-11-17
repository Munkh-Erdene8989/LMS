import { type DynamicModule, Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { SentryGlobalFilter, SentryModule } from '@sentry/nestjs/setup';
import { isSentryEnabled } from './sentry';

/**
 * Sentry идэвхтэй (SENTRY_DSN тохируулсан, instrument.ts эхлүүлсэн) үед л Nest-ийн
 * алдаа барих filter-ийг холбоно. Үгүй бол юу ч нэмэхгүй — dev/тестийн зан үйл өөрчлөгдөхгүй.
 */
@Module({})
export class ObservabilityModule {
  static register(): DynamicModule {
    if (!isSentryEnabled()) return { module: ObservabilityModule };
    return {
      module: ObservabilityModule,
      imports: [SentryModule.forRoot()],
      providers: [{ provide: APP_FILTER, useClass: SentryGlobalFilter }],
    };
  }
}
