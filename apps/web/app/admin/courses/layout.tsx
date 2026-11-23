import type { ReactNode } from 'react';
import { pageMeta } from '@/lib/page-meta';

export const metadata = pageMeta('course.navReviews');

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
