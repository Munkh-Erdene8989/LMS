import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(__dirname, '../../..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

/** Deploy тохиргооны "regression" хамгаалалт (ticket 23): Docker/Railway-д алдаа гарвал энд унана. */
describe('Deploy config', () => {
  const railway = JSON.parse(read('railway.json')) as {
    build: { builder: string; dockerfilePath: string };
    deploy: Record<string, unknown>;
  };

  it('Railway: health check /health, migration pre-deploy, restart policy', () => {
    expect(railway.build).toMatchObject({ builder: 'DOCKERFILE', dockerfilePath: 'Dockerfile' });
    expect(railway.deploy.healthcheckPath).toBe('/health');
    expect(railway.deploy.preDeployCommand).toEqual(['pnpm --filter @lms/db migrate:deploy:prod']);
    expect(railway.deploy.startCommand).toBe('node dist/main.js');
  });

  it('migrate:deploy:prod нь .env-гүй (платформын env) prisma migrate deploy', () => {
    const pkg = JSON.parse(read('packages/db/package.json')) as { scripts: Record<string, string> };
    expect(pkg.scripts['migrate:deploy:prod']).toBe('prisma migrate deploy');
  });

  it('Сертификатын фонт (apps/api/assets) байгаа, image-д орно', () => {
    expect(existsSync(join(root, 'apps/api/assets/fonts/NotoSans-Regular.ttf'))).toBe(true);
    expect(existsSync(join(root, 'apps/api/assets/fonts/NotoSans-Bold.ttf'))).toBe(true);
    const ignore = read('.dockerignore')
      .split('\n')
      .filter((l) => l.trim() && !l.startsWith('#'));
    expect(ignore.some((l) => /assets/.test(l))).toBe(false);
    const dockerfile = read('Dockerfile');
    expect(dockerfile).toMatch(/COPY \. \./);
    expect(dockerfile).toMatch(/WORKDIR \/app\/apps\/api/);
    expect(dockerfile).toMatch(/CMD \["node", "dist\/main\.js"\]/);
  });

  it('.dockerignore нууц .env-г хасдаг', () => {
    const lines = read('.dockerignore').split('\n');
    expect(lines).toContain('.env');
    expect(lines).toContain('.env.*');
  });

  it('CI: lint, typecheck, build, test + Postgres/Redis service', () => {
    const ci = read('.github/workflows/ci.yml');
    for (const step of ['pnpm lint', 'pnpm typecheck', 'pnpm build', 'pnpm test', 'postgres:17', 'redis:7']) {
      expect(ci).toContain(step);
    }
    expect(ci).toContain('schema=lms_test');
  });

  it('Vercel: web-ийн build shared-ийг хамт build хийнэ', () => {
    const vercel = JSON.parse(read('apps/web/vercel.json')) as { buildCommand: string };
    expect(vercel.buildCommand).toContain('@lms/web...');
  });
});
