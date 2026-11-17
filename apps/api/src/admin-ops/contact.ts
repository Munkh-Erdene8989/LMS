import type { Payment } from '@lms/db';
import type { AdminPaymentRow, AdminUserContact } from '@lms/shared';

/** Хэрэглэгчийн холбоо барих мэдээлэл уншихад `include`/`select`-д */
export const contactSelect = {
  id: true,
  name: true,
  identifiers: { select: { type: true, value: true } },
} as const;

export function toContact(u: {
  id: string;
  name: string | null;
  identifiers: { type: string; value: string }[];
}): AdminUserContact {
  return {
    id: u.id,
    name: u.name,
    phone: u.identifiers.find((i) => i.type === 'PHONE')?.value ?? null,
    email: u.identifiers.find((i) => i.type === 'EMAIL')?.value ?? null,
  };
}

export function toPaymentRow(p: Payment): AdminPaymentRow {
  return {
    id: p.id,
    purpose: p.purpose,
    method: p.method,
    status: p.status,
    amountMnt: p.amountMnt,
    paidAmountMnt: p.paidAmountMnt,
    credits: p.credits,
    isTest: p.isTest,
    providerInvoiceId: p.providerInvoiceId,
    providerPaymentId: p.providerPaymentId,
    failureReason: p.failureReason,
    createdAt: p.createdAt.toISOString(),
    paidAt: p.paidAt?.toISOString() ?? null,
    lastCheckedAt: p.lastCheckedAt?.toISOString() ?? null,
    resolution: p.resolution,
    resolutionNote: p.resolutionNote,
    resolvedAt: p.resolvedAt?.toISOString() ?? null,
  };
}
