export type Locale = 'id' | 'en';

export const DEFAULT_LOCALE: Locale = 'id';
export const LOCALES: readonly Locale[] = ['id', 'en'] as const;
export const LOCALE_COOKIE_NAME = 'locale';
export const LOCALE_STORAGE_KEY = 'locale';

export type DeepString<T> = {
  readonly [K in keyof T]: T[K] extends string
    ? string
    : T[K] extends readonly string[]
      ? readonly string[]
      : T[K] extends Record<string, unknown>
        ? DeepString<T[K]>
        : never;
};

export function resolveLocale(raw?: string | null): Locale {
  if (!raw) return DEFAULT_LOCALE;
  const normalized = raw.trim().toLowerCase();
  if (normalized === 'en' || normalized.startsWith('en-')) return 'en';
  if (normalized === 'id' || normalized.startsWith('id-')) return 'id';
  return DEFAULT_LOCALE;
}

export function formatMessage(
  template: string,
  params?: Record<string, string | number | null | undefined>
): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, key) => {
    const value = params[key];
    return value === undefined || value === null ? match : String(value);
  });
}
