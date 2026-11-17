import { Controller, Get, Param, ParseUUIDPipe, Post, Res, StreamableFile } from '@nestjs/common';
import type { CertificateStatus, CertificateVerification, CertificateView } from '@lms/shared';
import type { Response } from 'express';
import { Auth, CurrentUser, type CurrentUserInfo } from '../auth/auth.guard';
import { CertificatesService } from './certificates.service';

const Uuid = new ParseUUIDPipe();

/** Learner-ийн сертификатууд (ticket 15). */
@Controller('learning')
@Auth()
export class CertificatesController {
  constructor(private readonly certificates: CertificatesService) {}

  @Get('certificates')
  mine(@CurrentUser() u: CurrentUserInfo): Promise<CertificateView[]> {
    return this.certificates.mine(u.id);
  }

  /** Олгогдсон сертификат + олгох нөхцөлийн явц. */
  @Get('courses/:id/certificate')
  status(@CurrentUser() u: CurrentUserInfo, @Param('id', Uuid) id: string): Promise<CertificateStatus> {
    return this.certificates.status(u.id, id);
  }

  /** Хүсэлтээр олгох (idempotent): шинээр → 201, өмнө олгогдсон → 200; нөхцөл хангаагүй → 409. */
  @Post('courses/:id/certificate')
  async issue(
    @CurrentUser() u: CurrentUserInfo,
    @Param('id', Uuid) id: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<CertificateView> {
    const { certificate, created } = await this.certificates.issue(u.id, id);
    res.status(created ? 201 : 200);
    return certificate;
  }

  /** PDF — зөвхөн эзэмшигчид. */
  @Get('certificates/:code/pdf')
  async pdf(@CurrentUser() u: CurrentUserInfo, @Param('code') code: string): Promise<StreamableFile> {
    const pdf = await this.certificates.pdf(u.id, code);
    return new StreamableFile(pdf.body, {
      type: 'application/pdf',
      disposition: `attachment; filename="certificate-${pdf.code}.pdf"`,
      length: pdf.body.length,
    });
  }
}

/** Нийтийн verify (нэвтрэлтгүй) — ажил олгогч г.м кодоор шалгана. */
@Controller('certificates')
export class PublicCertificatesController {
  constructor(private readonly certificates: CertificatesService) {}

  @Get('verify/:code')
  verify(@Param('code') code: string): Promise<CertificateVerification> {
    return this.certificates.verify(code);
  }
}
