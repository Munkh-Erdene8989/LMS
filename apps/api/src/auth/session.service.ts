import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { ENV, type Env } from '../env';
import { PrismaService } from '../prisma/prisma.service';
import { ACCESS_TTL_SECONDS, REFRESH_TTL_SECONDS } from './cookies';
import { AuthErrors } from './errors';
import { signJwt } from './jwt';

export interface IssuedTokens {
  access: string;
  refresh: string;
}

/**
 * Access token: богино хугацаатай JWT. Refresh token: санамсаргүй opaque утга, DB-д hash-аар.
 * Refresh бүрт шинэ token (rotation); хуучныг дахин ашиглавал тухайн family бүхэлдээ хүчингүй.
 */
@Injectable()
export class SessionService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async issue(
    user: { id: string; tokenVersion: number },
    meta: { userAgent?: string; familyId?: string } = {},
  ): Promise<IssuedTokens> {
    const refresh = randomBytes(32).toString('base64url');
    await this.prisma.session.create({
      data: {
        userId: user.id,
        familyId: meta.familyId ?? randomUUID(),
        tokenHash: sha256(refresh),
        userAgent: meta.userAgent?.slice(0, 300) ?? null,
        expiresAt: new Date(Date.now() + REFRESH_TTL_SECONDS * 1000),
      },
    });
    return { access: this.accessToken(user), refresh };
  }

  async rotate(refresh: string | undefined, userAgent?: string): Promise<IssuedTokens> {
    if (!refresh) throw AuthErrors.refreshInvalid();
    const session = await this.prisma.session.findUnique({ where: { tokenHash: sha256(refresh) } });
    if (!session) throw AuthErrors.refreshInvalid();

    if (session.rotatedAt || session.revokedAt) {
      // Хуучин (эсвэл гарсан) token дахин ирлээ — хулгайлагдсан байж болзошгүй.
      await this.revokeFamily(session.familyId);
      throw AuthErrors.refreshInvalid();
    }
    if (session.expiresAt.getTime() <= Date.now()) throw AuthErrors.refreshInvalid();

    const { count } = await this.prisma.session.updateMany({
      where: { id: session.id, rotatedAt: null, revokedAt: null },
      data: { rotatedAt: new Date() },
    });
    if (count === 0) {
      await this.revokeFamily(session.familyId);
      throw AuthErrors.refreshInvalid();
    }

    const user = await this.prisma.user.findUnique({
      where: { id: session.userId },
      select: { id: true, tokenVersion: true },
    });
    if (!user) throw AuthErrors.refreshInvalid();
    return this.issue(user, { userAgent, familyId: session.familyId });
  }

  /** Энэ төхөөрөмжөөс гарах: тухайн refresh token-ий family-г хүчингүй болгоно. */
  async revoke(refresh: string | undefined): Promise<void> {
    if (!refresh) return;
    const session = await this.prisma.session.findUnique({ where: { tokenHash: sha256(refresh) } });
    if (session) await this.revokeFamily(session.familyId);
  }

  /** Бүх төхөөрөмжөөс гарах: бүх refresh token + tokenVersion нэмж бүх access token-ийг хүчингүй. */
  async revokeAll(userId: string): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } }),
      this.prisma.user.update({ where: { id: userId }, data: { tokenVersion: { increment: 1 } } }),
    ]);
  }

  private accessToken(user: { id: string; tokenVersion: number }): string {
    return signJwt({ sub: user.id, ver: user.tokenVersion }, this.env.JWT_SECRET, ACCESS_TTL_SECONDS);
  }

  private async revokeFamily(familyId: string): Promise<void> {
    await this.prisma.session.updateMany({ where: { familyId, revokedAt: null }, data: { revokedAt: new Date() } });
  }
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
