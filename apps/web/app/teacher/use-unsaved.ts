import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { t } from '@/lib/i18n';
import { useConfirm } from '../ui/confirm';

/**
 * Хадгалаагүй өөрчлөлт (эсвэл явж буй upload)-тэй үед:
 * - tab хаах / refresh / гадны линк → browser-ийн `beforeunload` анхааруулга;
 * - апп доторх линк (`next/link` гэх мэт) → `useConfirm` dialog, батлавал шилжинэ.
 * Хэд хэдэн editor зэрэг dirty бол эхний listener `preventDefault` хийж, бусад нь алгасна (нэг л dialog).
 */
export function useUnsavedWarning(dirty: boolean): void {
  const confirm = useConfirm();
  const router = useRouter();

  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = e.target instanceof Element ? e.target.closest<HTMLAnchorElement>('a[href]') : null;
      if (!a || (a.target && a.target !== '_self') || a.hasAttribute('download')) return;
      const url = new URL(a.href, window.location.href);
      if (url.origin !== window.location.origin) return; // гадны линк → beforeunload
      if (url.pathname === window.location.pathname && url.search === window.location.search) return; // зөвхөн #hash
      e.preventDefault();
      e.stopPropagation();
      void confirm({
        title: t('teacherUi.unsaved'),
        body: t('teacherUi.leaveBody'),
        confirmLabel: t('teacherUi.leave'),
        cancelLabel: t('teacherUi.stay'),
        danger: true,
      }).then((ok) => ok && router.push(url.pathname + url.search + url.hash));
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    document.addEventListener('click', onClick, true);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      document.removeEventListener('click', onClick, true);
    };
  }, [dirty, confirm, router]);
}
