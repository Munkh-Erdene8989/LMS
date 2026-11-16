import { resolve } from 'node:path';
import { config } from 'dotenv';
import type { NextConfig } from 'next';

// Local хөгжүүлэлтэд monorepo-ийн root `.env`-ийг уншина. Vercel дээр env-ийг платформ өгнө.
config({ path: resolve(__dirname, '../../.env'), quiet: true });

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

const nextConfig: NextConfig = {
  transpilePackages: ['@lms/shared'],
  /**
   * Browser API руу шууд биш, web-ийн `/api/*`-аар хандана → auth cookie first-party.
   * API-ийн `COOKIE_PATH_PREFIX` нь энэ угтвартай (`/api`) таарах ёстой.
   */
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${API_URL}/:path*` }];
  },
};

export default nextConfig;
