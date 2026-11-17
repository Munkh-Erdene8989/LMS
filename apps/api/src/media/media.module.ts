import { Inject, Logger, Module, type OnApplicationShutdown } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module';
import { ENV, type Env } from '../env';
import { MuxWebhookController, PlaybackController, TeacherVideoController } from './media.controller';
import { InMemoryPlaybackSessionStore, PLAYBACK_SESSIONS, RedisPlaybackSessionStore, type PlaybackSessionStore } from './playback-sessions';
import { MuxOrphanCleanupService } from './mux-orphans.service';
import { PlaybackService } from './playback.service';
import { VideoService } from './video.service';

/** Media (ticket 10): Mux upload, webhook, signed playback, зэрэг тоглуулалтын хязгаар. */
@Module({
  imports: [CatalogModule],
  controllers: [TeacherVideoController, PlaybackController, MuxWebhookController],
  providers: [
    VideoService,
    PlaybackService,
    MuxOrphanCleanupService,
    {
      provide: PLAYBACK_SESSIONS,
      inject: [ENV],
      useFactory: (env: Env): PlaybackSessionStore => {
        if (env.REDIS_URL) return new RedisPlaybackSessionStore(env.REDIS_URL);
        new Logger('Media').warn('REDIS_URL алга — тоглуулалтын heartbeat process дотор (dev)');
        return new InMemoryPlaybackSessionStore();
      },
    },
  ],
})
export class MediaModule implements OnApplicationShutdown {
  constructor(@Inject(PLAYBACK_SESSIONS) private readonly sessions: PlaybackSessionStore) {}

  async onApplicationShutdown(): Promise<void> {
    await this.sessions.close();
  }
}
