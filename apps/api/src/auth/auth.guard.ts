import {
  applyDecorators,
  createParamDecorator,
  Inject,
  Injectable,
  SetMetadata,
  UseGuards,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Role } from '@lms/db';
import type { Request } from 'express';
import { ENV, type Env } from '../env';
import { PrismaService } from '../prisma/prisma.service';
import { ACCESS_COOKIE, readCookie } from './cookies';
import { AuthErrors } from './errors';
import { verifyJwt } from './jwt';

export interface CurrentUserInfo {
  id: string;
  roles: Role[];
}

type AuthedRequest = Request & { user?: CurrentUserInfo };

const ROLES_KEY = 'auth:roles';

/**
 * Access cookie шалгаж `req.user`-ийг тохируулна. Role заасан бол тэдгээрийн аль нэг нь шаардлагатай.
 * tokenVersion-ийг DB-ээс шалгадаг тул "бүх төхөөрөмжөөс гарах" шууд хүчинтэй.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    const token = readCookie(req, ACCESS_COOKIE);
    const claims = token ? verifyJwt(token, this.env.JWT_SECRET) : null;
    if (!claims) throw AuthErrors.unauthenticated();

    const user = await this.prisma.user.findUnique({
      where: { id: claims.sub },
      select: { id: true, roles: true, tokenVersion: true },
    });
    if (!user || user.tokenVersion !== claims.ver) throw AuthErrors.unauthenticated();

    const required = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (required?.length && !required.some((r) => user.roles.includes(r))) throw AuthErrors.forbidden();

    req.user = { id: user.id, roles: user.roles };
    return true;
  }
}

/** Нэвтэрсэн хэрэглэгч шаардана; role өгвөл тэдгээрийн аль нэг нь заавал. */
export const Auth = (...roles: Role[]) => applyDecorators(SetMetadata(ROLES_KEY, roles), UseGuards(AuthGuard));

export const CurrentUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): CurrentUserInfo => ctx.switchToHttp().getRequest<AuthedRequest>().user!,
);

/**
 * Нэвтрэлт заавал биш (нийтийн каталог г.м): хүчинтэй access cookie байвал `req.user`-ийг тохируулна,
 * үгүй/хүчингүй бол зочин хэвээр — хэзээ ч 401 өгөхгүй. Handler-т `@Viewer()`-ээр уншина.
 */
@Injectable()
export class OptionalAuthGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    const token = readCookie(req, ACCESS_COOKIE);
    const claims = token ? verifyJwt(token, this.env.JWT_SECRET) : null;
    if (!claims) return true;
    const user = await this.prisma.user.findUnique({
      where: { id: claims.sub },
      select: { id: true, roles: true, tokenVersion: true },
    });
    if (user && user.tokenVersion === claims.ver) req.user = { id: user.id, roles: user.roles };
    return true;
  }
}

/** Нэвтрэлт заавал биш; `@Viewer()` нь нэвтэрсэн хэрэглэгч эсвэл `null`. */
export const OptionalAuth = () => UseGuards(OptionalAuthGuard);

export const Viewer = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): CurrentUserInfo | null =>
    ctx.switchToHttp().getRequest<AuthedRequest>().user ?? null,
);
