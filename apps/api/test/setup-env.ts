import { testDatabaseUrl } from './test-db-url';

// Тест бүрийн процесс тестийн schema руу л холбогдоно.
const url = testDatabaseUrl();
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = url;
process.env.DIRECT_URL = url;
process.env.JWT_SECRET = 'test-secret-test-secret-test-secret-0123456789';
// Тест API-г web proxy-гүй шууд дууддаг.
process.env.COOKIE_PATH_PREFIX = '';
// Тест гадны сервис рүү хэзээ ч хүрэхгүй (harness fake-ээр override хийдэг ч давхар хамгаалалт).
delete process.env.VERIFY_MN_API_KEY;
delete process.env.RESEND_API_KEY;
delete process.env.REDIS_URL;
delete process.env.QPAY_CLIENT_ID;
delete process.env.QPAY_CLIENT_SECRET;
for (const key of Object.keys(process.env)) if (key.startsWith('MUX_')) delete process.env[key];
process.env.RATE_LIMIT_ENABLED = 'false';
