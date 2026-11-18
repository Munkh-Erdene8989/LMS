import { headers } from 'next/headers';

/**
 * Түр demo өгөгдөл идэвхтэй үед доод буланд жижиг тэмдэг (ticket 33b). Флаггүй үед юу ч зурахгүй.
 * Стиль нь nonce-той `<style>` — inline `style` атрибут CSP-ээр хаагдаж болзошгүй тул.
 */
export async function DemoBadge() {
  // Флагийг шууд шалгана (import-гүй) → флаггүй build-д demo модуль server bundle-д ч орохгүй.
  if (process.env.NEXT_PUBLIC_DEMO_DATA !== '1') return null;
  const nonce = (await headers()).get('x-nonce') ?? undefined;
  return (
    <>
      <style
        nonce={nonce}
        dangerouslySetInnerHTML={{
          __html:
            '.demo-badge{position:fixed;left:12px;bottom:12px;z-index:9999;padding:4px 10px;border-radius:999px;font:600 12px/1.4 var(--font-inter,system-ui,sans-serif);background:#1d1d1f;color:#fff;opacity:.85;pointer-events:none}',
        }}
      />
      <div className="demo-badge" role="note">
        Demo өгөгдөл
      </div>
    </>
  );
}
