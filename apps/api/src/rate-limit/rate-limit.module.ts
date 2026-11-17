import { Global, Inject, Module, type OnApplicationShutdown } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ENV, type Env } from '../env';
import { GlobalRateLimitGuard, RateLimitGuard } from './rate-limit';
import {
  InMemoryRateLimitStore,
  RATE_LIMIT_STORE,
  RedisRateLimitStore,
  type RateLimitStore,
} from './rate-limit.store';

@Global()
@Module({
  providers: [
    {
      provide: RATE_LIMIT_STORE,
      inject: [ENV],
      useFactory: (env: Env): RateLimitStore =>
        env.REDIS_URL ? new RedisRateLimitStore(env.REDIS_URL) : new InMemoryRateLimitStore(),
    },
    RateLimitGuard,
    { provide: APP_GUARD, useClass: GlobalRateLimitGuard },
  ],
  exports: [RATE_LIMIT_STORE, RateLimitGuard],
})
export class RateLimitModule implements OnApplicationShutdown {
  constructor(@Inject(RATE_LIMIT_STORE) private readonly store: RateLimitStore) {}

  async onApplicationShutdown(): Promise<void> {
    await this.store.close();
  }
}
