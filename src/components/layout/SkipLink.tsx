'use client';

import React from 'react';
import { useTranslation } from '@/components/providers/LanguageProvider';

export function SkipLink() {
  const { t } = useTranslation();

  return (
    <a href="#main-content" className="skip-link">
      {t.common.skipToContent}
    </a>
  );
}
