import type { ReactNode } from 'react';
import { pageMeta } from '@/lib/page-meta';

export const metadata = pageMeta('me.title');

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
