import type { ReactNode } from 'react';
import { pageMeta } from '@/lib/page-meta';

export const metadata = pageMeta('assignment.inboxTitle');

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
