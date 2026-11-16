import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Query, Req } from '@nestjs/common';
import { BANKS, type AdminTeacherApplicationView, type BankAccountView, type MyTeacherApplication } from '@lms/shared';
import type { Request } from 'express';
import { z } from 'zod';
import { Auth, CurrentUser, type CurrentUserInfo } from '../auth/auth.guard';
import { ZodPipe } from '../zod-pipe';
import { TeacherService } from './teacher.service';

const text = (max: number) => z.string().trim().min(1).max(max);

export const BankSchema = z.object({
  bank: z.enum(BANKS),
  /** Дансны дугаар (6–20 орон) эсвэл IBAN (MN + 18 орон). Зай, зураасыг хасна. */
  accountNumber: z
    .string()
    .transform((v) => v.replace(/[\s-]/g, '').toUpperCase())
    .refine((v) => /^\d{6,20}$/.test(v) || /^MN\d{18}$/.test(v), 'Дансны дугаар буруу'),
  holderName: text(120),
});

const ApplicationSchema = z.object({
  displayName: text(120),
  bio: text(5000),
  expertise: text(500),
  sampleUrl: z.string().trim().url().startsWith('https://', 'https:// холбоос байх ёстой').max(500),
  agreementVersion: z.number().int().positive(),
  bankAccount: BankSchema,
});

const RejectSchema = z.object({ reason: text(2000) });
const ListQuery = z.object({ status: z.enum(['SUBMITTED', 'APPROVED', 'REJECTED']).default('SUBMITTED') });

@Controller('teacher')
@Auth()
export class TeacherController {
  constructor(private readonly teachers: TeacherService) {}

  @Get('application')
  mine(@CurrentUser() user: CurrentUserInfo): Promise<MyTeacherApplication> {
    return this.teachers.mine(user.id);
  }

  @Post('application')
  @HttpCode(200)
  submit(
    @CurrentUser() user: CurrentUserInfo,
    @Body(new ZodPipe(ApplicationSchema)) body: z.infer<typeof ApplicationSchema>,
    @Req() req: Request,
  ): Promise<MyTeacherApplication> {
    return this.teachers.submit(user.id, body, req.ip);
  }

  @Put('bank-account')
  bank(
    @CurrentUser() user: CurrentUserInfo,
    @Body(new ZodPipe(BankSchema)) body: z.infer<typeof BankSchema>,
    @Req() req: Request,
  ): Promise<BankAccountView> {
    return this.teachers.updateBankAccount(user.id, body, req.ip);
  }
}

@Controller('admin/teacher-applications')
@Auth('ADMIN')
export class AdminTeacherController {
  constructor(private readonly teachers: TeacherService) {}

  @Get()
  list(@Query(new ZodPipe(ListQuery)) query: z.infer<typeof ListQuery>): Promise<AdminTeacherApplicationView[]> {
    return this.teachers.list(query.status);
  }

  @Post(':id/approve')
  @HttpCode(204)
  approve(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() admin: CurrentUserInfo,
    @Req() req: Request,
  ): Promise<void> {
    return this.teachers.approve(id, admin.id, req.ip);
  }

  @Post(':id/reject')
  @HttpCode(204)
  reject(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodPipe(RejectSchema)) body: z.infer<typeof RejectSchema>,
    @CurrentUser() admin: CurrentUserInfo,
    @Req() req: Request,
  ): Promise<void> {
    return this.teachers.reject(id, admin.id, body.reason, req.ip);
  }
}
