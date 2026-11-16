'use client';

import type { UploadTicket } from '@lms/shared';

/** API-аас авсан signed URL руу файлыг шууд (API-аар дамжуулахгүй) илгээнэ. */
export async function uploadFile(ticket: UploadTicket, file: File): Promise<void> {
  const res = await fetch(ticket.url, {
    method: ticket.method,
    headers: { 'Content-Type': file.type || 'application/octet-stream' },
    body: file,
  });
  if (!res.ok) throw new Error(`Upload амжилтгүй (${res.status})`);
}
