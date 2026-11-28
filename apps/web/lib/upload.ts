'use client';

import type { UploadTicket } from '@lms/shared';

/**
 * API-аас авсан signed URL руу файлыг шууд (API-аар дамжуулахгүй) илгээнэ.
 * `contentType` — API-д зарласан төрөл (өгөхгүй бол `file.type`); storage үүнийг хадгалж API шалгана.
 */
export async function uploadFile(ticket: UploadTicket, file: File, contentType?: string): Promise<void> {
  const res = await fetch(ticket.url, {
    method: ticket.method,
    headers: { 'Content-Type': contentType ?? (file.type || 'application/octet-stream') },
    body: file,
  });
  if (!res.ok) throw new Error(`Upload амжилтгүй (${res.status})`);
}

/**
 * Том файлыг (видео) signed URL руу `PUT` — явцыг `onProgress(0–100)`-оор. Mux direct upload-д
 * Content-Type шаардлагагүй. Амжилтгүй бол `failMessage(status)`-ийн текстээр Error.
 */
export function uploadWithProgress(
  url: string,
  file: File,
  onProgress: (percent: number) => void,
  failMessage: (status: number) => string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.floor((e.loaded / e.total) * 100));
    };
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(failMessage(xhr.status))));
    xhr.onerror = () => reject(new Error(failMessage(0)));
    xhr.send(file);
  });
}
