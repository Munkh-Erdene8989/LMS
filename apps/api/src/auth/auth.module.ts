import { Module } from '@nestjs/common';
import { MeController } from '../users/me.controller';
import { UsersService } from '../users/users.service';
import { AuthController } from './auth.controller';
import { AuthGuard } from './auth.guard';
import { OtpService } from './otp.service';
import { SessionService } from './session.service';

@Module({
  controllers: [AuthController, MeController],
  providers: [OtpService, SessionService, UsersService, AuthGuard],
  exports: [UsersService, AuthGuard],
})
export class AuthModule {}
