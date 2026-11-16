import { testDatabaseUrl } from './test-db-url';

// Тест бүрийн процесс тестийн schema руу л холбогдоно.
const url = testDatabaseUrl();
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = url;
process.env.DIRECT_URL = url;
