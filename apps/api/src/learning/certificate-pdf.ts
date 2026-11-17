import { join } from 'node:path';
import { BRAND, formatCertificateCode, isoToUbLocal } from '@lms/shared';
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import { t } from '../i18n';

/**
 * Монгол кирилл (Ө, Ү г.м) PDF-ийн стандарт фонтод байхгүй тул Noto Sans (SIL OFL 1.1, `assets/fonts/OFL.txt`)
 * шигтгэнэ. pdfkit зөвхөн ашигласан glyph-уудыг subset хийж оруулна. Зам src/ ба dist/-ээс ижил.
 */
const FONT_DIR = join(__dirname, '../../assets/fonts');
const FONT_REGULAR = join(FONT_DIR, 'NotoSans-Regular.ttf');
const FONT_BOLD = join(FONT_DIR, 'NotoSans-Bold.ttf');

export interface CertificatePdfInput {
  code: string;
  recipientName: string;
  courseTitle: string;
  teacherName: string;
  quizAveragePercent: number | null;
  issuedAt: Date;
}

/** Олгогдсон (өөрчлөгдөхгүй) сертификатын мөрөөс PDF (A4 хэвтээ) — нэр, курс, багш, огноо, verify URL-ийн QR. */
export async function renderCertificatePdf(c: CertificatePdfInput, verifyUrl: string): Promise<Buffer> {
  const qr = await QRCode.toBuffer(verifyUrl, { type: 'png', errorCorrectionLevel: 'M', margin: 1, width: 360 });

  const doc = new PDFDocument({
    size: 'A4',
    layout: 'landscape',
    margin: 0,
    info: {
      Title: `${t('certificate.pdf.title')} — ${c.courseTitle}`,
      Author: BRAND.name,
      Subject: c.recipientName,
      CreationDate: c.issuedAt,
    },
  });
  doc.registerFont('regular', FONT_REGULAR);
  doc.registerFont('bold', FONT_BOLD);

  const chunks: Buffer[] = [];
  doc.on('data', (b: Buffer) => chunks.push(b));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  const W = doc.page.width;
  const H = doc.page.height;
  const inner = { x: 60, w: W - 120 };
  const ink = '#111827';
  const muted = '#6b7280';
  const accent = '#1d4ed8';

  // Хүрээ
  doc.lineWidth(3).strokeColor(accent).rect(24, 24, W - 48, H - 48).stroke();
  doc.lineWidth(0.8).strokeColor(accent).rect(32, 32, W - 64, H - 64).stroke();

  const center = (text: string, y: number, font: 'regular' | 'bold', size: number, color = ink) =>
    doc.font(font).fontSize(size).fillColor(color).text(text, inner.x, y, { width: inner.w, align: 'center' });

  center(BRAND.name, 62, 'bold', 14, accent);
  center(t('certificate.pdf.title'), 92, 'bold', 40);
  center(t('certificate.pdf.subtitle'), 146, 'regular', 13, muted);
  center(t('certificate.pdf.presented'), 190, 'regular', 14, muted);
  center(c.recipientName, 214, 'bold', 30);
  doc
    .moveTo(W / 2 - 180, doc.y + 6)
    .lineTo(W / 2 + 180, doc.y + 6)
    .lineWidth(0.8)
    .strokeColor(muted)
    .stroke();
  center(t('certificate.pdf.completed', { course: c.courseTitle }), doc.y + 20, 'regular', 16);
  center(t('certificate.pdf.teacher', { name: c.teacherName }), doc.y + 10, 'regular', 13, muted);

  // Доод хэсэг: огноо, оноо (зүүн), QR + код (баруун)
  const bottomY = H - 160;
  const [year, month, day] = isoToUbLocal(c.issuedAt.toISOString()).slice(0, 10).split('-');
  const date = t('certificate.pdf.date', { year: year!, month: Number(month), day: Number(day) });
  doc.font('regular').fontSize(12).fillColor(ink);
  doc.text(t('certificate.pdf.issuedAt', { date }), 70, bottomY + 30, { width: 360 });
  if (c.quizAveragePercent !== null) {
    doc.text(t('certificate.pdf.quizAverage', { percent: c.quizAveragePercent }), 70, doc.y + 4, { width: 360 });
  }

  const qrSize = 96;
  const qrX = W - 70 - qrSize;
  doc.image(qr, qrX, bottomY, { width: qrSize, height: qrSize });
  const textW = 300;
  doc
    .font('regular')
    .fontSize(9)
    .fillColor(muted)
    .text(t('certificate.pdf.verify'), qrX - textW - 12, bottomY + 18, { width: textW, align: 'right' })
    .text(verifyUrl, { width: textW, align: 'right' })
    .font('bold')
    .fillColor(ink)
    .text(t('certificate.pdf.code', { code: formatCertificateCode(c.code) }), { width: textW, align: 'right' });

  doc.end();
  return done;
}
