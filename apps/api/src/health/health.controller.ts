import { Controller, Get } from '@nestjs/common';
import { BRAND, type HealthResponse } from '@lms/shared';
import { PrismaService } from '../prisma/prisma.service';

@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async check(): Promise<HealthResponse> {
    let db: HealthResponse['db'] = 'ok';
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      db = 'error';
    }
    return {
      status: db === 'ok' ? 'ok' : 'degraded',
      db,
      brand: BRAND.name,
      time: new Date().toISOString(),
    };
  }
}
