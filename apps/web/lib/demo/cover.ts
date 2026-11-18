/**
 * Demo cover: гадны зураг ХОРИОТОЙ (CSP) тул `coverUrl: null` ба курсийн id-аас тодорхойлогдох gradient.
 * Id ижил бол үргэлж ижил өнгө (SSR/CSR зөрөхгүй).
 */
function hash(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** `style={{ background: coverGradient(course.id) }}` эсвэл CSS хувьсагчид өгөх `linear-gradient(...)`. */
export function coverGradient(id: string): string {
  const h = hash(id);
  const hue1 = h % 360;
  const hue2 = (hue1 + 40 + ((h >>> 9) % 80)) % 360;
  const angle = 120 + ((h >>> 17) % 90);
  return `linear-gradient(${angle}deg, hsl(${hue1} 70% 52%), hsl(${hue2} 75% 38%))`;
}
