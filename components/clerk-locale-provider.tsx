'use client';

import type { ComponentProps } from 'react';
import { ClerkProvider } from '@clerk/nextjs';
import { enUS } from '@clerk/localizations';
import { khKH } from '@/lib/clerk-km-KH';
import { useLanguage } from '@/lib/i18n';

// @clerk/localizations pulls a newer @clerk/shared than @clerk/nextjs bundles,
// so its LocalizationResource type is a structurally-duplicate (incompatible)
// copy of the one ClerkProvider expects. The runtime shape is identical; this
// cast just bridges the two type copies.
type ClerkLocalization = ComponentProps<typeof ClerkProvider>['localization'];

export function ClerkLocaleProvider({ children }: { children: React.ReactNode }) {
  const { lang } = useLanguage();
  const localization = (lang === 'km' ? khKH : enUS) as unknown as ClerkLocalization;
  return (
    <ClerkProvider localization={localization}>
      {children}
    </ClerkProvider>
  );
}
