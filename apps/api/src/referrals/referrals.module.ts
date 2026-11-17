import { Module } from '@nestjs/common';
import { ReferralsController, TeacherReferralController } from './referrals.controller';
import { ReferralsService } from './referrals.service';

/**
 * Referral линк ба attribution (ticket 11). `ReferralsService`-ийг худалдан авалт (`attribution`,
 * `claimCookie`) ба нэвтрэлт (`claimCookieSafe`) ашиглана.
 */
@Module({
  controllers: [ReferralsController, TeacherReferralController],
  providers: [ReferralsService],
  exports: [ReferralsService],
})
export class ReferralsModule {}
