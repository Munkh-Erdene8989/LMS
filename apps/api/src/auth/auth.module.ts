import { Module } from '@nestjs/common';
import { OrganizationsModule } from '../organizations/organizations.module';
import { ReferralsModule } from '../referrals/referrals.module';
import { MeController } from '../users/me.controller';
import { UsersService } from '../users/users.service';
import { AuthController } from './auth.controller';
import { AuthGuard } from './auth.guard';
import { OtpService } from './otp.service';
import { SessionService } from './session.service';

@Module({
  imports: [ReferralsModule, OrganizationsModule],
  controllers: [AuthController, MeController],
  providers: [OtpService, SessionService, UsersService, AuthGuard],
  exports: [UsersService, AuthGuard],
})
export class AuthModule {}
