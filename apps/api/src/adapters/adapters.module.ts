import { Global, Module } from '@nestjs/common';
import { EMAIL_SENDER, FakeEmailSender } from './email';
import { FakeSmsSender, SMS_SENDER } from './sms';

/**
 * Бодит adapter-ууд (verify.mn, Resend г.м) холбогдох ticket-үүдэд нэмэгдэнэ.
 * Тэр хүртэл fake хувилбар ашиглагдана; тест үргэлж fake-ээр override хийнэ.
 */
@Global()
@Module({
  providers: [
    { provide: SMS_SENDER, useClass: FakeSmsSender },
    { provide: EMAIL_SENDER, useClass: FakeEmailSender },
  ],
  exports: [SMS_SENDER, EMAIL_SENDER],
})
export class AdaptersModule {}
