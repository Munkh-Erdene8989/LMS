import { loadDotenv } from '../src/env';

/**
 * Тестийн DB URL. Аюулгүй байдлын үүднээс `schema=` параметр заавал байх ёстой
 * бөгөөд `public` байж болохгүй — тест тухайн schema-ийн бүх хүснэгтийг цэвэрлэдэг.
 */
export function testDatabaseUrl(): string {
  loadDotenv();
  const url = process.env.DATABASE_URL_TEST;
  if (!url) {
    throw new Error(
      'DATABASE_URL_TEST тохируулаагүй байна. .env.example-ийг харна уу (жишээ: ...?schema=lms_test).',
    );
  }
  const schema = new URL(url).searchParams.get('schema');
  if (!schema || schema === 'public') {
    throw new Error(
      `DATABASE_URL_TEST нь тусдаа schema заах ёстой (жишээ: ?schema=lms_test). Одоогийн: ${schema ?? '(байхгүй)'}`,
    );
  }
  return url;
}
