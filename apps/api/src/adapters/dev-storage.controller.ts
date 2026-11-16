import { Controller, Get, Inject, NotFoundException, Put, Query, Req, Res, ForbiddenException, HttpCode } from '@nestjs/common';
import type { Request, Response } from 'express';
import { LocalDiskStorage, STORAGE, type StorageAdapter } from './storage';

/**
 * Зөвхөн dev (Supabase-гүй): LocalDiskStorage-ийн гарын үсэгтэй URL-ууд энд ирнэ.
 * Supabase ашиглаж байвал бүх хүсэлт 404.
 */
@Controller('dev-storage')
export class DevStorageController {
  constructor(@Inject(STORAGE) private readonly storage: StorageAdapter) {}

  @Put('upload')
  @HttpCode(200)
  async upload(@Query() q: Record<string, string>, @Req() req: Request): Promise<{ ok: true }> {
    const local = this.local();
    if (!local.verify('upload', q.bucket ?? '', q.key ?? '', q.exp ?? '', q.sig ?? '')) throw new ForbiddenException();
    const body = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    await local.write(q.bucket as 'public' | 'private', q.key!, body, req.headers['content-type'] ?? 'application/octet-stream');
    return { ok: true };
  }

  @Get('file')
  async file(@Query() q: Record<string, string>, @Res() res: Response): Promise<void> {
    const local = this.local();
    if (!local.verify('file', q.bucket ?? '', q.key ?? '', q.exp ?? '', q.sig ?? '')) throw new ForbiddenException();
    const file = await local.read(q.bucket as 'public' | 'private', q.key!);
    if (!file) throw new NotFoundException();
    res.setHeader('Content-Type', file.contentType);
    res.send(file.body);
  }

  private local(): LocalDiskStorage {
    if (!(this.storage instanceof LocalDiskStorage)) throw new NotFoundException();
    return this.storage;
  }
}
