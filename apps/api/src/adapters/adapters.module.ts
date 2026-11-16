import { Global, Logger, Module } from '@nestjs/common';
import { ENV, type Env } from '../env';
import { EMAIL_SENDER, FakeEmailSender, ResendEmailSender, type EmailSender } from './email';
import {
  FakePhoneVerifier,
  PHONE_VERIFIER,
  VerifyMnPhoneVerifier,
  type PhoneVerifier,
} from './phone-verifier';

const log = new Logger('Adapters');

/**
 * Түлхүүр байвал бодит adapter, үгүй бол fake (зөвхөн dev — production-д env шалгалт
 * түлхүүрийг заавал болгоно). Тест үргэлж fake-ээр override хийнэ.
 */
@Global()
@Module({
  providers: [
    {
      provide: PHONE_VERIFIER,
      inject: [ENV],
      useFactory: (env: Env): PhoneVerifier => {
        if (env.VERIFY_MN_API_KEY) return new VerifyMnPhoneVerifier(env.VERIFY_MN_API_KEY);
        log.warn('VERIFY_MN_API_KEY алга — fake phone verifier (dev)');
        return new FakePhoneVerifier();
      },
    },
    {
      provide: EMAIL_SENDER,
      inject: [ENV],
      useFactory: (env: Env): EmailSender => {
        if (env.RESEND_API_KEY) return new ResendEmailSender(env.RESEND_API_KEY, env.EMAIL_FROM);
        log.warn('RESEND_API_KEY алга — имэйлийг консолд хэвлэнэ (dev)');
        const fake = new FakeEmailSender();
        return {
          send: async (m) => {
            log.log(`[dev email] ${m.to}: ${m.subject}\n${m.text ?? m.html}`);
            await fake.send(m);
          },
        };
      },
    },
  ],
  exports: [PHONE_VERIFIER, EMAIL_SENDER],
})
export class AdaptersModule {}
