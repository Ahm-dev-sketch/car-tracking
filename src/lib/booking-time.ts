import { DEFAULT_LOCALE, resolveLocale, type Locale } from './i18n/types';

export const APP_TIME_ZONE = 'Asia/Jakarta';
export const LAST_MINUTE_THRESHOLD_MINUTES = 60;

function parseValidDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Formats a timestamp in Asia/Jakarta (WIB) for both `id` and `en` locales.
 * Example `id`: "25 Nov 2026, 15.55 WIB"
 * Example `en`: "Nov 25, 2026, 3:55 PM WIB"
 */
export function formatBookingDateTime(
  value: string | Date | null | undefined,
  locale: Locale = DEFAULT_LOCALE
): string {
  const date = parseValidDate(value);
  if (!date) return '—';

  const resolved = resolveLocale(locale);
  if (resolved === 'id') {
    const formatted = new Intl.DateTimeFormat('id-ID', {
      timeZone: APP_TIME_ZONE,
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(date);
    return `${formatted} WIB`;
  }

  const formatted = new Intl.DateTimeFormat('en-US', {
    timeZone: APP_TIME_ZONE,
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(date);
  return `${formatted} WIB`;
}

/**
 * Formats short date in Asia/Jakarta for compact table cells (e.g. "25 Nov 2026" / "Nov 25, 2026").
 */
export function formatJakartaDate(
  value: string | Date | null | undefined,
  locale: Locale = DEFAULT_LOCALE,
  options: { includeYear?: boolean } = {}
): string {
  const date = parseValidDate(value);
  if (!date) return '—';

  const resolved = resolveLocale(locale);
  return new Intl.DateTimeFormat(resolved === 'id' ? 'id-ID' : 'en-US', {
    timeZone: APP_TIME_ZONE,
    month: 'short',
    day: 'numeric',
    ...(options.includeYear ? { year: 'numeric' } : {}),
  }).format(date);
}

/**
 * Formats time in Asia/Jakarta with WIB suffix (e.g. "15.55 WIB" / "3:55 PM WIB").
 */
export function formatJakartaTime(
  value: string | Date | null | undefined,
  locale: Locale = DEFAULT_LOCALE
): string {
  const date = parseValidDate(value);
  if (!date) return '—';

  const resolved = resolveLocale(locale);
  const formatted = new Intl.DateTimeFormat(resolved === 'id' ? 'id-ID' : 'en-US', {
    timeZone: APP_TIME_ZONE,
    hour: resolved === 'id' ? '2-digit' : 'numeric',
    minute: '2-digit',
    hour12: resolved === 'en',
  }).format(date);
  return `${formatted} WIB`;
}

/**
 * Returns true when a booking was submitted within `thresholdMinutes` (default 60 min)
 * before its scheduled departure (allowing a small negative skew for "depart now" submissions).
 */
export function isLastMinuteBooking(
  createdAt: string | Date | null | undefined,
  departureAt: string | Date | null | undefined,
  thresholdMinutes: number = LAST_MINUTE_THRESHOLD_MINUTES
): boolean {
  const created = parseValidDate(createdAt);
  const departure = parseValidDate(departureAt);
  if (!created || !departure) return false;

  const diffMs = departure.getTime() - created.getTime();
  return diffMs >= -15 * 60 * 1000 && diffMs < thresholdMinutes * 60 * 1000;
}
