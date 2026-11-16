import { resolve } from 'node:path';
import { config } from 'dotenv';
import type { NextConfig } from 'next';

// Local хөгжүүлэлтэд monorepo-ийн root `.env`-ийг уншина. Vercel дээр env-ийг платформ өгнө.
config({ path: resolve(__dirname, '../../.env'), quiet: true });

const nextConfig: NextConfig = {
  transpilePackages: ['@lms/shared'],
};

export default nextConfig;
