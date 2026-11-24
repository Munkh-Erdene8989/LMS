'use client';

import { LinkButton, type LinkButtonProps } from '../ui/button';
import { track } from '@/lib/track';

/** LinkButton + `cta_click` хэмжилт. `id` нь тогтмол байрлалын нэр (жишээ: `hero_browse`), хэрэглэгчийн өгөгдөл биш. */
export function TrackedLink({ id, onClick, ...rest }: LinkButtonProps & { id: string }) {
  return (
    <LinkButton
      {...rest}
      onClick={(e) => {
        track('cta_click', { cta: id });
        onClick?.(e);
      }}
    />
  );
}
