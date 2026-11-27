import type { OrgAdminStatus } from '@lms/shared';

export const ORG_STATUS_TONE: Record<OrgAdminStatus, 'ok' | 'neutral' | 'warn'> = {
  ACTIVE: 'ok',
  INACTIVE: 'neutral',
  EXPIRED: 'warn',
};
