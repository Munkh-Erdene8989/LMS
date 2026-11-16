import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@lms/db';

/** Lazy холболт: DB түр унасан ч апп асаж, /health нь "db: error" гэж мэдээлнэ. */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
