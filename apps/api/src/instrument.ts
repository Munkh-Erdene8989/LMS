/** main.ts-ийн хамгийн эхний import: Sentry-г Nest/express-ээс өмнө эхлүүлнэ (auto-instrumentation). */
import { loadDotenv } from './env';
import { initSentry } from './observability/sentry';

loadDotenv();
initSentry();
