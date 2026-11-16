import { Global, Logger, Module } from '@nestjs/common';
import { ENV, type Env } from '../env';
import { EMAIL_SENDER, FakeEmailSender, ResendEmailSender, type EmailSender } from './email';
import {
  FakePhoneVerifier,
  PHONE_VERIFIER,
  VerifyMnPhoneVerifier,
  type PhoneVerifier,
} from './phone-verifier';
import { DevStorageController } from './dev-storage.controller';
import { LOCAL_STORAGE_ROOT, LocalDiskStorage, STORAGE, SupabaseStorage, type StorageAdapter } from './storage';

const log = new Logger('Adapters');

/**
 * Түлхүүр байвал бодит adapter, үгүй бол fake (зөвхөн dev — production-д env шалгалт
 * түлхүүрийг заавал болгоно). Тест үргэлж fake-ээр override хийнэ.
 */
@Global()
@Module({
  controllers: [DevStorageController],
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
    {
      provide: STORAGE,
      inject: [ENV],
      useFactory: async (env: Env): Promise<StorageAdapter> => {
        if (env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY) {
          const storage = new SupabaseStorage(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
          await storage.ensureBuckets();
          return storage;
        }
        log.warn('SUPABASE_URL алга — файлыг local дискэнд хадгална (dev)');
        return new LocalDiskStorage(LOCAL_STORAGE_ROOT, env.JWT_SECRET, env.COOKIE_PATH_PREFIX);
      },
    },
  ],
  exports: [PHONE_VERIFIER, EMAIL_SENDER, STORAGE],
})
export class AdaptersModule {}
