import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { SettingKey, SettingRevisionView, SettingView } from '@lms/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from './audit.service';
import { isSettingKey, SETTING_KEYS, SETTINGS } from './settings.registry';

/**
 * Платформын тохиргоо. Бусад модуль (кредит, худалдан авалт, payout) утгыг зөвхөн
 * `get()`-ээр уншина — үүнийг худалдан авалтын мөчид бичилтэд хадгална (SPEC: мөнгөний дүрэм).
 */
@Injectable()
export class SettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async get(key: SettingKey): Promise<number> {
    const row = await this.prisma.setting.findUnique({ where: { key } });
    return row ? Number(row.value) : SETTINGS[key].default;
  }

  async getAll(): Promise<Record<SettingKey, number>> {
    return Object.fromEntries((await this.list()).map((s) => [s.key, s.value])) as Record<SettingKey, number>;
  }

  async list(): Promise<SettingView[]> {
    const rows = await this.prisma.setting.findMany({ where: { key: { in: SETTING_KEYS } } });
    const byKey = new Map(rows.map((r) => [r.key, r]));
    return SETTING_KEYS.map((key) => {
      const def = SETTINGS[key];
      const row = byKey.get(key);
      return {
        key,
        value: row ? Number(row.value) : def.default,
        defaultValue: def.default,
        unit: def.unit,
        min: def.min,
        max: def.max,
        updatedAt: row?.updatedAt.toISOString() ?? null,
      };
    });
  }

  async update(key: string, value: unknown, actor: { id: string; ip?: string }): Promise<SettingView> {
    const k = this.assertKey(key);
    const def = SETTINGS[k];
    if (typeof value !== 'number' || !Number.isInteger(value) || value < def.min || value > def.max) {
      throw new BadRequestException({
        code: 'INVALID_SETTING_VALUE',
        message: `Утга ${def.min}–${def.max} хооронд бүхэл тоо байх ёстой.`,
      });
    }

    await this.prisma.$transaction(async (tx) => {
      const existing = await tx.setting.findUnique({ where: { key: k } });
      const previous = existing ? Number(existing.value) : def.default;
      if (existing && previous === value) return; // өөрчлөлтгүй — түүх, audit бичихгүй
      await tx.setting.upsert({ where: { key: k }, create: { key: k, value }, update: { value } });
      await tx.settingRevision.create({ data: { key: k, previous, value, changedById: actor.id } });
      await this.audit.record(tx, {
        actorId: actor.id,
        action: 'setting.update',
        targetType: 'setting',
        targetId: k,
        before: { value: previous },
        after: { value },
        ip: actor.ip,
      });
    });
    return (await this.list()).find((s) => s.key === k)!;
  }

  async history(key: string): Promise<SettingRevisionView[]> {
    const k = this.assertKey(key);
    const rows = await this.prisma.settingRevision.findMany({
      where: { key: k },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: { changedBy: { select: { id: true, name: true } } },
    });
    return rows.map((r) => ({
      id: r.id,
      previous: Number(r.previous),
      value: Number(r.value),
      changedBy: r.changedBy,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  private assertKey(key: string): SettingKey {
    if (!isSettingKey(key)) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Тохиргоо олдсонгүй.' });
    return key;
  }
}
