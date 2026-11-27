import { Module } from '@nestjs/common';
import { OrgInvitationsService } from './org-invitations.service';
import { OrgReportService } from './org-report.service';
import { OrganizationsController } from './organizations.controller';
import { OrganizationsService } from './organizations.service';

/**
 * Байгууллагын админ удирдлага ба урилга (ticket 45). Эрхийн дүрэм `org-access.ts`-д (ticket 44).
 * `OrgInvitationsService`-ийг auth (OTP нэвтрэлт, identifier холбох) hook-оор дууддаг тул export хийнэ.
 */
@Module({
  controllers: [OrganizationsController],
  providers: [OrganizationsService, OrgInvitationsService, OrgReportService],
  exports: [OrgInvitationsService],
})
export class OrganizationsModule {}
